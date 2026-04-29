import fs from 'fs/promises'
import fsSync from 'fs'
import { exec } from 'child_process'
import { promisify } from 'util'
import path from 'path'
import jsYaml from 'js-yaml'
import { runWithoutTools } from '../core/tools.js'
import { isImage, validateFileSize } from '../core/utils.js'

const execAsync = promisify(exec)

/**
 * Execute a shell step and capture output
 * @param {string} command
 * @returns {Promise<{stdout:string,stderr:string,exitCode:number}>}
 */
async function executeStep(command) {
  try {
    const { stdout, stderr } = await execAsync(command, { shell: true, maxBuffer: 20 * 1024 * 1024 })
    return { stdout: stdout.toString(), stderr: stderr.toString(), exitCode: 0 }
  } catch (err) {
    return {
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : err.message,
      exitCode: typeof err.code === 'number' ? err.code : 1
    }
  }
}

function validatePlan(plan, planFile) {
  if (!plan || typeof plan !== 'object') {
    throw new Error(`Plan is not a YAML object: ${planFile}`)
  }

  if (!plan.version) {
    throw new Error(`Missing required field 'version' in plan: ${planFile}`)
  }

  if (!Array.isArray(plan.steps) || plan.steps.length === 0) {
    throw new Error(`Missing required field 'steps' in plan: ${planFile}`)
  }

  if (plan.attachments !== undefined) {
    if (!Array.isArray(plan.attachments)) {
      throw new Error(`'attachments' must be an array of file paths in plan: ${planFile}`)
    }
    for (const [i, attachment] of plan.attachments.entries()) {
      if (typeof attachment !== 'string' || !attachment.trim()) {
        throw new Error(`attachments[${i}] must be a non-empty file path string in plan: ${planFile}`)
      }
    }
  }

  for (const [index, step] of plan.steps.entries()) {
    if (!step || typeof step !== 'object') {
      throw new Error(`Step ${index + 1} is not an object`) }
    if (!step.name) {
      throw new Error(`Missing required field 'name' for step ${index + 1}`)
    }
    if (!step.exec) {
      throw new Error(`Missing required field 'exec' for step ${index + 1}`)
    }
  }
}

function parseCliVars(options) {
  const rawVars = options.var
  if (!rawVars) {
    return {}
  }

  const entries = Array.isArray(rawVars) ? rawVars : [rawVars]
  const vars = {}

  for (const entry of entries) {
    if (typeof entry !== 'string' || !entry.includes('=')) {
      throw new Error(`Invalid --var value: ${entry}. Expected key=value.`)
    }

    const [key, ...rest] = entry.split('=')
    if (!key) {
      throw new Error(`Invalid --var value: ${entry}. Expected key=value.`)
    }

    vars[key] = rest.join('=')
  }

  return vars
}

function filterPrivateVars(vars) {
  return Object.fromEntries(
    Object.entries(vars).filter(([key]) => !key.startsWith('__LLMCTRLX_'))
  )
}

function mergeVars(planVars, cliVars, envVars = {}) {
  if (planVars && (typeof planVars !== 'object' || Array.isArray(planVars))) {
    throw new Error('Plan vars must be a mapping of key/value pairs')
  }

  return {
    ...filterPrivateVars(envVars),
    ...filterPrivateVars(planVars || {}),
    ...filterPrivateVars(cliVars),
  }
}

function interpolateString(str, vars) {
  if (typeof str !== 'string') {
    return str
  }

  const missing = new Set()
  const value = str.replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return String(vars[name])
    }
    missing.add(name)
    return match
  })

  if (missing.size > 0) {
    const next = Array.from(missing)[0]
    throw new Error(`Unknown variable: {{${next}}}`)
  }

  return value
}

function interpolatePlan(plan, vars) {
  const interpolated = { ...plan }

  if (typeof interpolated.name === 'string') {
    interpolated.name = interpolateString(interpolated.name, vars)
  }
  if (typeof interpolated.prompt === 'string') {
    interpolated.prompt = interpolateString(interpolated.prompt, vars)
  }
  if (typeof interpolated.system === 'string') {
    interpolated.system = interpolateString(interpolated.system, vars)
  }
  if (interpolated.output && typeof interpolated.output.save === 'string') {
    interpolated.output = { ...interpolated.output, save: interpolateString(interpolated.output.save, vars) }
  }

  if (Array.isArray(interpolated.attachments)) {
    interpolated.attachments = interpolated.attachments.map((filePath) =>
      interpolateString(filePath, vars)
    )
  }

  interpolated.steps = plan.steps.map((step) => {
    const nextStep = { ...step }
    if (typeof nextStep.name === 'string') {
      nextStep.name = interpolateString(nextStep.name, vars)
    }
    if (typeof nextStep.exec === 'string') {
      nextStep.exec = interpolateString(nextStep.exec, vars)
    }
    return nextStep
  })

  return interpolated
}

function buildPlanPrompt(plan, results) {
  const promptParts = []
  promptParts.push(`Plan: ${plan.name || 'Unnamed Plan'}`)
  promptParts.push(`Version: ${plan.version}`)

  if (plan.prompt) {
    promptParts.push(`Prompt: ${plan.prompt}`)
  }

  if (plan.output && plan.output.format) {
    promptParts.push(`Please format the final response as ${plan.output.format}.`)
  }

  promptParts.push('Step outputs:')

  for (const result of results) {
    promptParts.push(`---`)
    promptParts.push(`Step: ${result.name}`)
    promptParts.push(`Command: ${result.exec}`)
    promptParts.push(`Exit code: ${result.exitCode}`)
    if (result.stdout) {
      promptParts.push(`Stdout:\n${result.stdout.trim()}`)
    }
    if (result.stderr) {
      promptParts.push(`Stderr:\n${result.stderr.trim()}`)
    }
  }

  promptParts.push('Please provide a concise analysis of the plan results and next steps where appropriate.')
  return promptParts.join('\n\n')
}

/**
 * Build an image message in the correct format for the active provider.
 *
 * Ollama native API  → { role, content: string, images: [base64] }
 * LMStudio / OpenAI → { role, content: [{type:'image_url', image_url:{url:'data:…'}}, {type:'text',…}] }
 *
 * @param {string} filePath
 * @param {string} provider - 'lmstudio' | 'ollama' (default)
 * @returns {Object}
 */
function buildImageMessage(filePath, provider) {
  const imgData = fsSync.readFileSync(filePath).toString('base64')
  const label = `Attached image: ${path.basename(filePath)}`

  if (provider === 'lmstudio') {
    const ext = path.extname(filePath).slice(1).toLowerCase()
    const mimeType = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`
    return {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imgData}` } },
        { type: 'text', text: label }
      ]
    }
  }

  // Ollama default
  return { role: 'user', content: label, images: [imgData] }
}

/**
 * Build message objects for plan-level attachments (images and text files).
 * @param {string[]} attachments - Array of file paths from the plan YAML
 * @param {number} maxUploadFileSize - Maximum allowed file size in bytes
 * @param {string} provider - 'lmstudio' | 'ollama'
 * @returns {Promise<Object[]>} Array of LLM message objects ready to prepend to the request
 */
async function buildAttachmentMessages(attachments, maxUploadFileSize, provider) {
  const attachmentMessages = []

  for (const filePath of attachments) {
    try {
      validateFileSize(filePath, maxUploadFileSize)
    } catch (e) {
      console.error(`Skipping attachment '${filePath}' due to size error: ${e.message}`)
      continue
    }

    if (isImage(filePath)) {
      attachmentMessages.push(buildImageMessage(filePath, provider))
    } else {
      const content = await fs.readFile(filePath, 'utf8')
      attachmentMessages.push({
        role: 'user',
        content: `Attached file: ${filePath}\n${content}`
      })
    }
  }

  return attachmentMessages
}

/**
 * Handle plan command
 * @param {Object} llm
 * @param {Object} options
 * @param {number} [maxUploadFileSize=10485760] - Maximum attachment file size in bytes (default 10 MB)
 */
export async function cmdPlan(llm, options, maxUploadFileSize = 10 * 1024 * 1024) {
  const positional = options._ || []
  const planFile = positional[0]

  if (!planFile) {
    console.error('Usage: llmctrlx plan <plan-file> [--dry-run]')
    process.exit(1)
  }

  let rawYaml
  try {
    rawYaml = await fs.readFile(planFile, 'utf8')
  } catch (err) {
    console.error(`Unable to read plan file '${planFile}': ${err.message}`)
    process.exit(1)
  }

  let plan
  try {
    plan = jsYaml.load(rawYaml)
  } catch (err) {
    console.error(`Invalid YAML in '${planFile}': ${err.message}`)
    process.exit(1)
  }

  try {
    validatePlan(plan, planFile)
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }

  let vars
  try {
    const cliVars = parseCliVars(options)
    vars = mergeVars(plan.vars, cliVars, process.env)
    plan = interpolatePlan(plan, vars)
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }

  const dryRun = Boolean(options['dry-run'] || options.dryRun)
  const model = options.model || plan.model
  const systemPrompt = options.system || plan.system

  if (!model) {
    console.error('No model specified via plan or --model')
    process.exit(1)
  }

  if (dryRun) {
    console.log(`Dry run plan: ${plan.name || planFile}`)
    plan.steps.forEach((step, index) => {
      console.log(`${index + 1}. ${step.name}: ${step.exec}`)
    })
    return
  }

  const results = []

  for (const [index, step] of plan.steps.entries()) {
    console.log(`Executing step ${index + 1}/${plan.steps.length}: ${step.name}`)
    const result = await executeStep(step.exec)
    results.push({ name: step.name, exec: step.exec, ...result })
  }

  const prompt = buildPlanPrompt(plan, results)
  const messages = []

  if (systemPrompt) {
    messages.push({ role: 'system', content: systemPrompt })
  }

  // Prepend any plan-level attachments so the model sees them before the step outputs
  const provider = (options.provider || 'ollama').toLowerCase()

  if (Array.isArray(plan.attachments) && plan.attachments.length > 0) {
    const attachmentMessages = await buildAttachmentMessages(plan.attachments, maxUploadFileSize, provider)
    messages.push(...attachmentMessages)
  }

  messages.push({ role: 'user', content: prompt })

  const analysis = await runWithoutTools(llm, model, messages)

  console.log(analysis)

  if (plan.output && plan.output.save) {
    try {
      await fs.writeFile(plan.output.save, analysis, 'utf8')
      console.log(`Saved report to ${plan.output.save}`)
    } catch (err) {
      console.error(`Failed to write report to '${plan.output.save}': ${err.message}`)
      process.exit(1)
    }
  }
}
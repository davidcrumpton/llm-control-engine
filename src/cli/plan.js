/**
 * Plan command handler for llmctrlx
 *
 * Security hardening vs the original:
 *  1. process.env is NO LONGER passed to mergeVars.
 *  2. executeStep uses execFile() (no shell).
 *  3. Executable allow-list validation.
 *  4. Hard timeouts and stdout caps.
 */

import fs from 'fs/promises'
import fsSync from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import jsYaml from 'js-yaml'
import { runWithoutTools, loadTools, executeTool } from '../core/tools.js'
import { isImage, validateFileSize, buildImageMessage } from '../core/utils.js'
import { validatePolicy, validateStep } from '../core/policy.js'

const execFileAsync = promisify(execFile)

// ─── Security Configuration ──────────────────────────────────────────────────

const ALLOWED_STEP_EXECUTABLES = new Set([
  'ls', 'cat', 'echo', 'pwd', 'date', 'find', 'grep', 'wc', 'head', 'tail',
  'df', 'du', 'uname', 'uptime', 'ps', 'env', 'printenv', 'id', 'whoami',
  'git', 'node', 'npm', 'python', 'python3', 'pip', 'pip3',
  'curl', 'wget', 'jq', 'yq', 'awk', 'sed', 'sort', 'uniq', 'cut', 'tr',
  'tar', 'gzip', 'gunzip', 'zip', 'unzip',
  'make', 'cmake', 'cargo', 'go', 'ssh',
])

const ALLOWED_ENV_VARS = new Set([
  'HOME', 'USER', 'LOGNAME', 'SHELL', 'TERM', 'LANG', 'LC_ALL',
  'PATH', 'PWD', 'TMPDIR', 'TMP', 'TEMP',
  'NODE_ENV', 'CI',
])

const EXEC_TIMEOUT_MS  = 60_000
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024
const SHELL_META_RE = /[;&|`$<>\\!{}()\n\r]/

// ─── Command Execution ───────────────────────────────────────────────────────

function tokenise(input) {
  const tokens = []
  let current = ''
  let inSingle = false
  let inDouble = false

  for (let i = 0; i < input.length; i++) {
    const ch = input[i]
    if (ch === "'" && !inDouble) { inSingle = !inSingle; continue }
    if (ch === '"' && !inSingle) { inDouble = !inDouble; continue }
    if (!inSingle && !inDouble && ch === ' ') {
      if (current.length) { tokens.push(current); current = '' }
      continue
    }
    current += ch
  }
  if (current.length) tokens.push(current)
  return tokens
}

async function executeCommandAction(command) {
  if (SHELL_META_RE.test(command)) {
    return { stdout: '', stderr: `Step rejected: shell metacharacters are not permitted in exec strings. Got: ${command}`, exitCode: 1 }
  }

  const [executable, ...args] = tokenise(command)

  if (!executable) {
    return { stdout: '', stderr: 'Step rejected: empty exec string.', exitCode: 1 }
  }

  if (!ALLOWED_STEP_EXECUTABLES.has(executable)) {
    return { stdout: '', stderr: `Step rejected: '${executable}' is not in the allowed-executable list.`, exitCode: 1 }
  }

  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
    })
    return { stdout: stdout.toString(), stderr: stderr.toString(), exitCode: 0 }
  } catch (err) {
    if (err.killed) {
      return { stdout: '', stderr: `Step timed out after ${EXEC_TIMEOUT_MS / 1000}s.`, exitCode: 1 }
    }
    return {
      stdout: err.stdout ? err.stdout.toString() : '',
      stderr: err.stderr ? err.stderr.toString() : err.message,
      exitCode: typeof err.code === 'number' ? err.code : 1,
    }
  }
}

// ─── Validation & Normalization ──────────────────────────────────────────────

function normalizeAndValidatePlan(plan, planFile) {
  if (!plan || typeof plan !== 'object') throw new Error(`Plan is not a YAML object: ${planFile}`)
  if (!plan.version) throw new Error(`Missing required field 'version' in plan: ${planFile}`)
  if (!Array.isArray(plan.steps) || plan.steps.length === 0) throw new Error(`Missing required field 'steps' in plan: ${planFile}`)

  validatePolicy(plan)

  if (plan.attachments !== undefined) {
    if (!Array.isArray(plan.attachments)) throw new Error(`'attachments' must be an array of file paths in plan: ${planFile}`)
    plan.attachments.forEach((attachment, i) => {
      if (typeof attachment !== 'string' || !attachment.trim()) {
        throw new Error(`attachments[${i}] must be a non-empty file path string in plan: ${planFile}`)
      }
    })
  }

  plan.steps.forEach((step, index) => {
    if (!step || typeof step !== 'object') throw new Error(`Step ${index + 1} is not an object`)
    if (!step.name && !step.id) throw new Error(`Missing required field 'name' or 'id' for step ${index + 1}`)
    
    // Normalize IDs and Names
    step.id = step.id || step.name
    step.name = step.name || step.id
    
    if (!step.exec && !step.type) throw new Error(`Missing required field 'exec' or 'type' for step ${index + 1}`)
    
    validateStep(step, plan.policy)
  })
  
  return plan
}

// ─── Variable Interpolation ──────────────────────────────────────────────────

function parseCliVars(options) {
  const rawVars = options.var
  if (!rawVars) return {}
  return (Array.isArray(rawVars) ? rawVars : [rawVars]).reduce((acc, entry) => {
    if (typeof entry !== 'string' || !entry.includes('=')) throw new Error(`Invalid --var value: ${entry}. Expected key=value.`)
    const [key, ...rest] = entry.split('=')
    if (!key) throw new Error(`Invalid --var value: ${entry}. Expected key=value.`)
    acc[key] = rest.join('=')
    return acc
  }, {})
}

function safeEnvSubset() {
  return Array.from(ALLOWED_ENV_VARS).reduce((safe, key) => {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) safe[key] = process.env[key]
    return safe
  }, {})
}

function mergeVars(planVars, cliVars, safeEnv = {}) {
  if (planVars && (typeof planVars !== 'object' || Array.isArray(planVars))) {
    throw new Error('Plan vars must be a mapping of key/value pairs')
  }
  return { ...safeEnv, ...(planVars || {}), ...cliVars }
}

function interpolateString(str, vars) {
  if (typeof str !== 'string') return str
  const missing = new Set()
  const value = str.replace(/{{\s*([A-Za-z0-9_]+)\s*}}/g, (match, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return String(vars[name])
    missing.add(name)
    return match
  })
  if (missing.size > 0) throw new Error(`Unknown variable: {{${Array.from(missing)[0]}}}`)
  return value
}

function interpolatePlan(plan, vars) {
  const interpolated = { ...plan }

  if (interpolated.name) interpolated.name = interpolateString(interpolated.name, vars)
  if (interpolated.prompt) interpolated.prompt = interpolateString(interpolated.prompt, vars)
  if (interpolated.system) interpolated.system = interpolateString(interpolated.system, vars)

  if (interpolated.output?.save) {
    interpolated.output = { ...interpolated.output, save: interpolateString(interpolated.output.save, vars) }
  }

  if (Array.isArray(interpolated.attachments)) {
    interpolated.attachments = interpolated.attachments.map(filePath => interpolateString(filePath, vars))
  }

  interpolated.steps = plan.steps.map(step => {
    const nextStep = { ...step }
    if (nextStep.name) nextStep.name = interpolateString(nextStep.name, vars)
    if (nextStep.id) nextStep.id = interpolateString(nextStep.id, vars)
    if (nextStep.exec) nextStep.exec = interpolateString(nextStep.exec, vars)
    if (nextStep.prompt) nextStep.prompt = interpolateString(nextStep.prompt, vars)
    
    if (nextStep.args && typeof nextStep.args === 'object') {
      nextStep.args = Object.entries(nextStep.args).reduce((acc, [k, v]) => {
        acc[k] = typeof v === 'string' ? interpolateString(v, vars) : v
        return acc
      }, {})
    }
    return nextStep
  })

  return interpolated
}

// ─── Step Execution ──────────────────────────────────────────────────────────

async function executeStepAction(step, loadedTools, llm, planModel, contextData) {
  if (step.exec) {
    return await executeCommandAction(step.exec)
  } 
  
  if (step.type === 'tool') {
    const toolToRun = loadedTools.find(t => t.name === step.tool)
    if (!toolToRun) throw new Error(`Tool '${step.tool}' not found.`)
    try {
      const toolOutput = await executeTool(toolToRun, step.args || {})
      return { stdout: toolOutput, stderr: '', exitCode: 0 }
    } catch (err) {
      return { stdout: '', stderr: err.message, exitCode: 1 }
    }
  } 
  
  if (step.type === 'prompt') {
    const stepMessages = []
    if (step.context?.from_steps) {
      step.context.from_steps.forEach(fromStep => {
        const prevResult = contextData[fromStep]
        if (prevResult?.stdout) stepMessages.push({ role: 'user', content: `Context from step '${fromStep}':\n${prevResult.stdout}` })
      })
    }
    stepMessages.push({ role: 'user', content: step.prompt })
    try {
      const promptOutput = await runWithoutTools(llm, planModel, stepMessages)
      return { stdout: promptOutput, stderr: '', exitCode: 0 }
    } catch (err) {
      return { stdout: '', stderr: err.message, exitCode: 1 }
    }
  }

  return { stdout: '', stderr: `Unknown step type: ${step.type}`, exitCode: 1 }
}

// ─── Report & Output Generation ──────────────────────────────────────────────

function buildPlanPrompt(plan, results) {
  const promptParts = [
    `Plan: ${plan.name || 'Unnamed Plan'}`,
    `Version: ${plan.version}`
  ]

  if (plan.prompt) promptParts.push(`Prompt: ${plan.prompt}`)
  if (plan.output?.format) promptParts.push(`Please format the final response as ${plan.output.format}.`)
  
  promptParts.push('Step outputs:')
  for (const result of results) {
    promptParts.push(
      '---',
      `Step: ${result.name}`,
      `Command: ${result.exec}`,
      `Exit code: ${result.exitCode}`
    )
    if (result.stdout) promptParts.push(`Stdout:\n${result.stdout.trim()}`)
    if (result.stderr) promptParts.push(`Stderr:\n${result.stderr.trim()}`)
  }

  promptParts.push('Please provide a concise analysis of the plan results and next steps where appropriate.')
  return promptParts.join('\n\n')
}

async function buildAttachmentMessages(attachments, maxUploadFileSize, provider) {
  const messages = []
  for (const filePath of attachments) {
    try {
      validateFileSize(filePath, maxUploadFileSize)
      if (isImage(filePath)) {
        const imgData = fsSync.readFileSync(filePath).toString('base64')
        messages.push(buildImageMessage(filePath, imgData, provider))
      } else {
        const content = await fs.readFile(filePath, 'utf8')
        messages.push({ role: 'user', content: `Attached file: ${filePath}\n${content}` })
      }
    } catch (e) {
      console.error(`Skipping attachment '${filePath}' due to error: ${e.message}`)
    }
  }
  return messages
}

async function generateLegacyReport(plan, results, llm, options, maxUploadFileSize) {
  const prompt = buildPlanPrompt(plan, results)
  const messages = []
  const model = options.model || plan.model
  const systemPrompt = options.system || plan.system
  const provider = (options.provider || 'ollama').toLowerCase()

  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt })

  if (plan.attachments?.length > 0) {
    messages.push(...await buildAttachmentMessages(plan.attachments, maxUploadFileSize, provider))
  }

  messages.push({ role: 'user', content: prompt })
  const analysis = await runWithoutTools(llm, model, messages)
  
  console.log(analysis)

  if (plan.output?.save) {
    await fs.writeFile(plan.output.save, analysis, 'utf8')
    console.log(`Saved report to ${plan.output.save}`)
  }
}

async function processOutputs(planOutputs, contextData) {
  if (!planOutputs?.save) return
  for (const saveCmd of planOutputs.save) {
    const stepRes = contextData[saveCmd.step]
    if (stepRes?.stdout) {
      try {
        await fs.writeFile(saveCmd.to, stepRes.stdout, 'utf8')
        console.log(`Saved step '${saveCmd.step}' report to ${saveCmd.to}`)
      } catch (err) {
        console.error(`Failed to write report to '${saveCmd.to}': ${err.message}`)
      }
    }
  }
}

// ─── Main CLI Command ────────────────────────────────────────────────────────

export async function cmdPlan(llm, options, maxUploadFileSize = 10 * 1024 * 1024) {
  try {
    const positional = options._ || []
    const planFile = positional[0]

    if (!planFile) throw new Error('Usage: llmctrlx plan <plan-file> [--dry-run]')

    const rawYaml = await fs.readFile(planFile, 'utf8')
    let plan = jsYaml.load(rawYaml)
    
    plan = normalizeAndValidatePlan(plan, planFile)

    const cliVars = parseCliVars(options)
    const vars = mergeVars(plan.vars, cliVars, safeEnvSubset())
    plan = interpolatePlan(plan, vars)

    const dryRun = Boolean(options['dry-run'] || options.dryRun)
    const model = options.model || plan.model

    if (!model) throw new Error('No model specified via plan or --model')

    if (dryRun) {
      console.log(`Dry run plan: ${plan.name || planFile}`)
      plan.steps.forEach((step, index) => console.log(`${index + 1}. ${step.name}: ${step.exec}`))
      return
    }

    const results = []
    const contextData = {}
    const hasToolSteps = plan.steps.some(s => s.type === 'tool')
    
    const loadedTools = hasToolSteps 
      ? await loadTools(options.tools_dir || process.env.LLMCTRLX_TOOLS_DIR) 
      : []

    for (const [index, step] of plan.steps.entries()) {
      console.log(`Executing step ${index + 1}/${plan.steps.length}: ${step.name}`)
      
      const result = await executeStepAction(step, loadedTools, llm, model, contextData)
      const execLabel = step.exec || step.tool || 'prompt'
      
      results.push({ name: step.name, exec: execLabel, ...result })
      contextData[step.id] = result
      
      if (result.exitCode !== 0 && plan.flow?.on_error === 'stop') {
         console.error(`Step failed and flow.on_error is 'stop'. Aborting plan.`)
         break
      }
    }

    if (plan.prompt || (!plan.outputs && plan.output?.save)) {
      await generateLegacyReport(plan, results, llm, options, maxUploadFileSize)
    }
    
    await processOutputs(plan.outputs, contextData)

  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
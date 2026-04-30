/**
 * Plan command handler for llmctrlx
 *
 * Security hardening vs the original:
 *
 *  1. process.env is NO LONGER passed to mergeVars.  Only an explicit
 *     allow-list of safe environment variables is forwarded.  This prevents
 *     plan YAML files from exfiltrating secrets via template interpolation.
 *
 *  2. executeStep now uses execFile() (no shell) instead of
 *     exec(command, { shell: true }).  The step.exec string is tokenised into
 *     [executable, ...args] before being handed to execFile, so shell
 *     metacharacters have no effect.
 *
 *  3. The executable extracted from each step is validated against an
 *     allow-list before execution.
 *
 *  4. A hard timeout and a smaller stdout cap are applied per step.
 */

import fs from 'fs/promises'
import fsSync from 'fs'
import { execFile } from 'child_process'
import { promisify } from 'util'
import jsYaml from 'js-yaml'
import { runWithoutTools } from '../core/tools.js'
import { isImage, validateFileSize, buildImageMessage } from '../core/utils.js'

const execFileAsync = promisify(execFile)

// ─── Security: step-executable allow-list ────────────────────────────────────
// Extend this list deliberately. Never replace it with a deny-list.
const ALLOWED_STEP_EXECUTABLES = new Set([
  'ls', 'cat', 'echo', 'pwd', 'date', 'find', 'grep', 'wc', 'head', 'tail',
  'df', 'du', 'uname', 'uptime', 'ps', 'env', 'printenv', 'id', 'whoami',
  'git', 'node', 'npm', 'python', 'python3', 'pip', 'pip3',
  'curl', 'wget', 'jq', 'yq', 'awk', 'sed', 'sort', 'uniq', 'cut', 'tr',
  'tar', 'gzip', 'gunzip', 'zip', 'unzip',
  'make', 'cmake', 'cargo', 'go',
  // Add further safe executables here as needed.
])

// ─── Security: allowed environment variable names ────────────────────────────
// Only these env vars are visible to plan templates.  Add more as needed.
const ALLOWED_ENV_VARS = new Set([
  'HOME', 'USER', 'LOGNAME', 'SHELL', 'TERM', 'LANG', 'LC_ALL',
  'PATH', 'PWD', 'TMPDIR', 'TMP', 'TEMP',
  'NODE_ENV', 'CI',
])

const EXEC_TIMEOUT_MS  = 60_000           // 60-second per-step hard timeout
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024  // 5 MB stdout cap per step

// Shell metacharacters that must never appear in a step exec string.
const SHELL_META_RE = /[;&|`$<>\\!{}()\n\r]/

/**
 * Naively tokenise a command string into [executable, ...args].
 * Supports single- and double-quoted tokens; deliberately rejects any
 * shell constructs.
 */
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

/**
 * Execute a plan step safely — no shell involved.
 *
 * @param {string} command - The raw exec string from the YAML step.
 * @returns {Promise<{stdout:string, stderr:string, exitCode:number}>}
 */
async function executeStep(command) {
  // Guard: reject shell metacharacters
  if (SHELL_META_RE.test(command)) {
    return {
      stdout: '',
      stderr: `Step rejected: shell metacharacters are not permitted in exec strings. Got: ${command}`,
      exitCode: 1,
    }
  }

  const [executable, ...args] = tokenise(command)

  if (!executable) {
    return { stdout: '', stderr: 'Step rejected: empty exec string.', exitCode: 1 }
  }

  if (!ALLOWED_STEP_EXECUTABLES.has(executable)) {
    return {
      stdout: '',
      stderr: `Step rejected: '${executable}' is not in the allowed-executable list.`,
      exitCode: 1,
    }
  }

  try {
    const { stdout, stderr } = await execFileAsync(executable, args, {
      timeout:   EXEC_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      // No `shell` option → defaults to false
    })
    return { stdout: stdout.toString(), stderr: stderr.toString(), exitCode: 0 }
  } catch (err) {
    if (err.killed) {
      return {
        stdout: '',
        stderr: `Step timed out after ${EXEC_TIMEOUT_MS / 1000}s.`,
        exitCode: 1,
      }
    }
    return {
      stdout:   err.stdout ? err.stdout.toString() : '',
      stderr:   err.stderr ? err.stderr.toString() : err.message,
      exitCode: typeof err.code === 'number' ? err.code : 1,
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
      throw new Error(`Step ${index + 1} is not an object`)
    }
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
  if (!rawVars) return {}

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

/**
 * Build a safe subset of the current environment.
 *
 * Only variables named in ALLOWED_ENV_VARS are forwarded.
 * This prevents plan templates from reading secrets such as
 * AWS_SECRET_ACCESS_KEY, DATABASE_URL, etc.
 *
 * @returns {Record<string,string>}
 */
function safeEnvSubset() {
  const safe = {}
  for (const key of ALLOWED_ENV_VARS) {
    if (Object.prototype.hasOwnProperty.call(process.env, key)) {
      safe[key] = process.env[key]
    }
  }
  return safe
}

function mergeVars(planVars, cliVars, safeEnv = {}) {
  if (planVars && (typeof planVars !== 'object' || Array.isArray(planVars))) {
    throw new Error('Plan vars must be a mapping of key/value pairs')
  }

  // Precedence (highest last, wins): safeEnv < planVars < cliVars
  return {
    ...safeEnv,
    ...(planVars || {}),
    ...cliVars,
  }
}

function interpolateString(str, vars) {
  if (typeof str !== 'string') return str

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

  if (typeof interpolated.name   === 'string') interpolated.name   = interpolateString(interpolated.name,   vars)
  if (typeof interpolated.prompt === 'string') interpolated.prompt = interpolateString(interpolated.prompt, vars)
  if (typeof interpolated.system === 'string') interpolated.system = interpolateString(interpolated.system, vars)

  if (interpolated.output && typeof interpolated.output.save === 'string') {
    interpolated.output = {
      ...interpolated.output,
      save: interpolateString(interpolated.output.save, vars),
    }
  }

  if (Array.isArray(interpolated.attachments)) {
    interpolated.attachments = interpolated.attachments.map(
      (filePath) => interpolateString(filePath, vars)
    )
  }

  interpolated.steps = plan.steps.map((step) => {
    const nextStep = { ...step }
    if (typeof nextStep.name === 'string') nextStep.name = interpolateString(nextStep.name, vars)
    if (typeof nextStep.exec === 'string') nextStep.exec = interpolateString(nextStep.exec, vars)
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
    promptParts.push('---')
    promptParts.push(`Step: ${result.name}`)
    promptParts.push(`Command: ${result.exec}`)
    promptParts.push(`Exit code: ${result.exitCode}`)
    if (result.stdout) promptParts.push(`Stdout:\n${result.stdout.trim()}`)
    if (result.stderr) promptParts.push(`Stderr:\n${result.stderr.trim()}`)
  }

  promptParts.push('Please provide a concise analysis of the plan results and next steps where appropriate.')
  return promptParts.join('\n\n')
}

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
      const imgData = fsSync.readFileSync(filePath).toString('base64')
      attachmentMessages.push(buildImageMessage(filePath, imgData, provider))
    } else {
      const content = await fs.readFile(filePath, 'utf8')
      attachmentMessages.push({
        role: 'user',
        content: `Attached file: ${filePath}\n${content}`,
      })
    }
  }

  return attachmentMessages
}

/**
 * Handle plan command
 * @param {Object} llm
 * @param {Object} options
 * @param {number} [maxUploadFileSize=10485760]
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
    // Security: pass only an allow-listed env subset, not the full process.env
    vars = mergeVars(plan.vars, cliVars, safeEnvSubset())
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

  const provider = (options.provider || 'ollama').toLowerCase()

  if (Array.isArray(plan.attachments) && plan.attachments.length > 0) {
    const attachmentMessages = await buildAttachmentMessages(
      plan.attachments, maxUploadFileSize, provider
    )
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

/**
 * Plan command handler for llmctrlx
 *
 * Extended with optional --record <file> support.
 * When --record is set a Recorder captures every step result and the final
 * LLM report, then writes a self-contained session JSON file.
 *
 * Security hardening (unchanged from original):
 *  1. process.env is NOT passed to mergeVars.
 *  2. executeStep uses execFile() (no shell).
 *  3. Executable allow-list validation.
 *  4. Hard timeouts and stdout caps.
 */

import fs              from 'fs/promises'
import fsSync          from 'fs'
import { execFile }    from 'child_process'
import { promisify }   from 'util'
import jsYaml          from 'js-yaml'
import { runWithoutTools, loadTools, executeTool } from '../core/tools.js'
import { isImage, validateFileSize, buildImageMessage } from '../core/utils.js'
import { validatePolicy, validateStep }              from '../core/policy.js'
import { Recorder }                                  from '../core/recorder.js'

const execFileAsync = promisify(execFile)

// ─── Security Constraints ──────────────────────────────────────────────────────────

const ALLOWED_STEP_EXECUTABLES = new Set([
  'ls', 'cat', 'echo', 'pwd', 'date', 'whoami',
  'df', 'du', 'uname', 'uptime', 'ps',
  'git', 'node', 'npm', 'python', 'python3',
  'grep', 'awk', 'sed', 'find', 'wc', 'sort', 'uniq', 'head', 'tail', 'jq',
  'curl', 'wget', 'tar', 'zip', 'unzip', 'cp', 'mv', 'mkdir', 'rm', 'touch',
  'chmod', 'chown', 'env', 'which', 'xargs', 'printenv', 'id',
  'pip', 'pip3',
  'yq', 'cut', 'tr',
  'gzip', 'gunzip',
  'make', 'cmake', 'cargo', 'go', 'ssh',
])

const STEP_TIMEOUT_MS   = 60_000
const MAX_STDOUT_BYTES  = 5 * 1024 * 1024
const SHELL_META_RE     = /[;&|`$<>\\!{}()\n\r]/

// ─── Plan normalisation & validation (unchanged) ──────────────────────────────

function normalizeAndValidatePlan(plan, planFile) {
  if (!plan || typeof plan !== 'object') throw new Error(`Invalid plan file: ${planFile}`)
  if (!plan.steps || !Array.isArray(plan.steps)) throw new Error('Plan must have a steps array')
  if (plan.steps.length === 0) throw new Error('Plan must have at least one step')

  plan.steps = plan.steps.map((step, i) => {
    if (!step.id)   step.id   = `step_${i + 1}`
    if (!step.name) step.name = step.id
    if (!step.type) step.type = step.exec ? 'exec' : (step.tool ? 'tool' : 'prompt')
    return step
  })

  validatePolicy(plan)
  plan.steps.forEach(step => validateStep(step, plan.policy || {}))

  return plan
}

// ─── Variable handling (unchanged) ────────────────────────────────────────────

function parseCliVars(options) {
  const vars = {}
  const raw  = options.var || options.vars || []
  const list = Array.isArray(raw) ? raw : [raw]
  for (const entry of list) {
    const eq = entry.indexOf('=')
    if (eq > 0) vars[entry.slice(0, eq)] = entry.slice(eq + 1)
  }
  return vars
}

function safeEnvSubset() {
  const ALLOWED_ENV_KEYS = new Set(['HOME', 'USER', 'PATH', 'SHELL', 'LANG', 'TZ'])
  const safe = {}
  for (const key of ALLOWED_ENV_KEYS) {
    if (process.env[key] !== undefined) safe[key] = process.env[key]
  }
  return safe
}

function mergeVars(planVars = {}, cliVars = {}, envVars = {}) {
  return { ...envVars, ...planVars, ...cliVars }
}

function interpolateString(str, vars) {
  return str.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`)
}

function interpolatePlan(plan, vars) {
  return JSON.parse(interpolateString(JSON.stringify(plan), vars))
}

// ─── Step execution (unchanged) ───────────────────────────────────────────────

async function executeStepAction(step, loadedTools, llm, planModel, contextData) {
  if (step.type === 'exec') {
    if (!step.exec?.trim()) {
      return { stdout: '', stderr: 'Empty exec command', exitCode: 1 }
    }
    if (SHELL_META_RE.test(step.exec)) {
      return { stdout: '', stderr: 'Command rejected: shell metacharacters not permitted', exitCode: 1 }
    }

    const tokens     = step.exec.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g)
      ?.map(t => t.replace(/^['"]|['"]$/g, '')) || []
    const [executable, ...args] = tokens

    if (!ALLOWED_STEP_EXECUTABLES.has(executable)) {
      return { stdout: '', stderr: `Executable '${executable}' not in allow-list`, exitCode: 1 }
    }

    try {
      const { stdout, stderr } = await execFileAsync(executable, args, {
        timeout     : STEP_TIMEOUT_MS,
        maxBuffer   : MAX_STDOUT_BYTES,
        windowsHide : true,
        env         : { ...process.env, SHLVL: '1' },
      })
      return { stdout, stderr, exitCode: 0 }
    } catch (err) {
      return { stdout: '', stderr: err.message, exitCode: 1 }
    }
  }

  if (step.type === 'tool') {
    const tool = loadedTools.find(t => t.name === step.tool)
    if (!tool) return { stdout: '', stderr: `Tool '${step.tool}' not found`, exitCode: 1 }
    try {
      const result = await executeTool(tool, step.args || {})
      return { stdout: result, stderr: '', exitCode: 0 }
    } catch (err) {
      return { stdout: '', stderr: err.message, exitCode: 1 }
    }
  }

  if (step.type === 'prompt') {
    const stepMessages = []
    if (step.context?.from_steps) {
      step.context.from_steps.forEach(fromStep => {
        const prevResult = contextData[fromStep]
        if (prevResult?.stdout) {
          stepMessages.push({ role: 'user', content: `Context from step '${fromStep}':\n${prevResult.stdout}` })
        }
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

// ─── Report & output generation (unchanged) ───────────────────────────────────

function buildPlanPrompt(plan, results) {
  const promptParts = [
    `Plan: ${plan.name || 'Unnamed Plan'}`,
    `Version: ${plan.version}`,
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
  const prompt      = buildPlanPrompt(plan, results)
  const messages    = []
  const model       = options.model || plan.model
  const systemPrompt = options.system || plan.system
  const provider    = (options.provider || 'ollama').toLowerCase()

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

  return analysis
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

// ─── Main CLI command ─────────────────────────────────────────────────────────

/**
 * Handle plan command
 *
 * @param {Object} llm                - LLM provider instance
 * @param {Object} options            - CLI options (includes options.record)
 * @param {number} maxUploadFileSize
 */
export async function cmdPlan(llm, options, maxUploadFileSize = 10 * 1024 * 1024) {
  try {
    const positional = options._ || []
    const planFile   = positional[0]
    const recordFile = options.record ?? null

    if (!planFile) throw new Error('Usage: llmctrlx plan <plan-file> [--dry-run] [--record <file>]')

    const rawYaml = await fs.readFile(planFile, 'utf8')
    let plan      = jsYaml.load(rawYaml)

    plan = normalizeAndValidatePlan(plan, planFile)

    const cliVars = parseCliVars(options)
    const vars    = mergeVars(plan.vars, cliVars, safeEnvSubset())
    plan          = interpolatePlan(plan, vars)

    const dryRun = Boolean(options['dry-run'] || options.dryRun)
    const model  = options.model || plan.model

    if (!model) throw new Error('No model specified via plan or --model')

    if (dryRun) {
      console.log(`Dry run plan: ${plan.name || planFile}`)
      plan.steps.forEach((step, index) => console.log(`${index + 1}. ${step.name}: ${step.exec}`))
      return
    }

    // Build recorder inputs before execution (hash over what drives the run)
    const recorderInputs = {
      model      : model,
      parameters : {
        temperature : options.temperature,
        top_p       : options.top_p,
      },
      planFile,
      planName   : plan.name || null,
      planVersion: plan.version || null,
      vars,
    }

    const recorder = recordFile ? new Recorder('plan', recorderInputs) : null
    if (recorder) recorder.markExecStart()

    const results     = []
    const contextData = {}
    const hasToolSteps = plan.steps.some(s => s.type === 'tool')

    const loadedTools = hasToolSteps
      ? await loadTools(options.tools_dir || process.env.LLMCTRLX_TOOLS_DIR)
      : []

    for (const [index, step] of plan.steps.entries()) {
      console.log(`Executing step ${index + 1}/${plan.steps.length}: ${step.name}`)

      const result    = await executeStepAction(step, loadedTools, llm, model, contextData)
      const execLabel = step.exec || step.tool || 'prompt'

      results.push({ name: step.name, exec: execLabel, ...result })
      contextData[step.id] = result

      // Record every step into the session
      if (recorder) {
        recorder.recordStep(step.id, step.name, execLabel, result)
      }

      if (result.exitCode !== 0 && plan.flow?.on_error === 'stop') {
        console.error(`Step failed and flow.on_error is 'stop'. Aborting plan.`)
        break
      }
    }

    if (recorder) recorder.markExecEnd()

    // Generate LLM report
    let llmResponse = ''

    if (recorder) recorder.markLlmStart()

    if (plan.prompt || (!plan.outputs && plan.output?.save)) {
      llmResponse = await generateLegacyReport(plan, results, llm, options, maxUploadFileSize)
    }

    await processOutputs(plan.outputs, contextData)

    if (recorder) {
      recorder.markLlmEnd()
      recorder.setOutputs({ llmResponse, exitCode: 0 })
      await recorder.save(recordFile)
      console.error(`[record] session saved → ${recordFile}`)
    }

  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
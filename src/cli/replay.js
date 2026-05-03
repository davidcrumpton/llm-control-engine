/**
 * Replay command handler for llmctrlx
 *
 * Usage
 * ─────
 *   llmctl replay session.json            # playback — echo recorded response
 *   llmctl replay session.json --diff     # re-execute and diff against recording
 *
 * Playback mode
 *   Reads the session file and prints the recorded LLM response.
 *   Zero side-effects: no LLM call, no shell execution, no history write.
 *   Useful for: sharing past outputs, debugging, CI artefact inspection.
 *
 * Diff mode (--diff)
 *   Re-runs the original command with its recorded inputs, collects a fresh
 *   Recorder, then feeds both sessions into differ.buildDiffReport().
 *   Useful for: CI/CD reproducibility checks, model comparison, regression testing.
 *
 *   Exit code 0 = fully reproducible
 *   Exit code 2 = differences found (not an error — caller decides what to do)
 *   Exit code 1 = fatal error (missing file, unsupported type, etc.)
 */

import { loadSession, Recorder, makeToolCallRecorder } from '../core/recorder.js'
import { buildDiffReport }                             from '../core/differ.js'
import { buildToolPrompt }               from '../core/utils.js'
import { createPluginRegistry, runWithTools, runWithoutTools } from '../core/tools.js'
import { execFile }    from 'node:child_process'
import { promisify }   from 'node:util'

const execFileAsync = promisify(execFile)

// ─── Playback ─────────────────────────────────────────────────────────────────

/**
 * Print the recorded response and a brief summary header.
 *
 * @param {Object} session - Loaded session envelope
 */
function playback(session) {
  console.error(`[replay] playback — ${session.command_type} recorded at ${session.recordedAt}`)
  console.error(`[replay] runHash: ${session.runHash}`)

  if (session.outputs.error) {
    console.error(`[replay] ⚠ this session recorded an error: ${session.outputs.error}`)
  }

  if (session.outputs.stdout) {
    console.error('[replay] ── shell stdout ──')
    console.log(session.outputs.stdout)
  }

  if (session.outputs.llmResponse) {
    console.error('[replay] ── llm response ──')
    console.log(session.outputs.llmResponse)
  }
}

// ─── Re-execution helpers ─────────────────────────────────────────────────────

/**
 * Re-run a "run" session.
 *
 * @param {Object} session - Original session envelope
 * @param {Object} llm     - LLM provider
 * @returns {Promise<Recorder>}
 */
async function reExecuteRun(session, llm) {
  const { inputs } = session
  const recorder   = new Recorder('run', inputs)

  // Shell execution
  const tokens     = inputs.command.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g)
    ?.map(t => t.replace(/^['"]|['"]$/g, '')) || []
  const [executable, ...args] = tokens

  recorder.markExecStart()
  let stdout = ''
  try {
    const result = await execFileAsync(executable, args, {
      timeout     : 30_000,
      maxBuffer   : 1024 * 1024,
      windowsHide : true,
      env         : { ...process.env, SHLVL: '1' },
    })
    stdout = result.stdout
  } catch (err) {
    stdout = ''
    recorder.setOutputs({ stdout, llmResponse: '', exitCode: 1, error: err.message })
    return recorder
  }
  recorder.markExecEnd()

  // LLM call
  recorder.markLlmStart()
  const res = await llm.chat({
    model    : inputs.model,
    messages : [{ role: 'user', content: `Command output:\n${stdout}` }],
  })
  recorder.markLlmEnd()

  const llmResponse = res.message.content
  recorder.setOutputs({ stdout, llmResponse, exitCode: 0 })
  return recorder
}

/**
 * Re-run a "chat" session.
 *
 * @param {Object} session  - Original session envelope
 * @param {Object} llm      - LLM provider
 * @param {string} toolsDir - Tools directory
 * @returns {Promise<Recorder>}
 */
async function reExecuteChat(session, llm, toolsDir) {
  const { inputs } = session
  const recorder   = new Recorder('chat', inputs)

  const messages = []
  if (inputs.system) messages.push({ role: 'system', content: inputs.system })
  messages.push({ role: 'user', content: inputs.user })

  const chatOptions = {}
  if (inputs.parameters?.temperature) chatOptions.temperature = inputs.parameters.temperature
  if (inputs.parameters?.top_p)       chatOptions.top_p       = inputs.parameters.top_p
  if (inputs.parameters?.num_ctx)     chatOptions.num_ctx     = inputs.parameters.num_ctx

  // Attach tool call recorder
  chatOptions.onToolCall = makeToolCallRecorder(recorder)

  recorder.markLlmStart()

  let llmResponse = ''

  if (inputs.no_tools) {
    llmResponse = await runWithoutTools(llm, inputs.model, messages, chatOptions)
  } else {
    const effectiveToolsDir = inputs.toolsDir || toolsDir
    const registry          = await createPluginRegistry(effectiveToolsDir)
    const requestedTags     = inputs.tags?.split(',').map(t => t.trim())

    let tools = registry.list('tool')
    if (requestedTags) {
      tools = tools.filter(t =>
        (t.tags || []).includes('always') ||
        requestedTags.some(tag => (t.tags || []).includes(tag))
      )
    }

    messages.unshift({ role: 'system', content: buildToolPrompt(tools) })
    llmResponse = await runWithTools(
      llm, inputs.model, messages, tools, registry.list('policy'), chatOptions
    )
  }

  recorder.markLlmEnd()
  recorder.setOutputs({ llmResponse })
  return recorder
}

/**
 * Re-run a "plan" session.
 *
 * Loads the original plan file (path is in inputs.planFile) and re-executes
 * it with the recorded vars so the hash covers the same logical inputs.
 *
 * @param {Object} session - Original session envelope
 * @param {Object} llm     - LLM provider
 * @returns {Promise<Recorder>}
 */
async function reExecutePlan(session, llm) {
  const { inputs } = session

  if (!inputs.planFile) {
    throw new Error('Session inputs.planFile is missing — cannot re-execute plan.')
  }

  // Dynamically import plan internals to avoid circular deps at module load time
  const { cmdPlan } = await import('./plan.js')

  const recorder = new Recorder('plan', inputs)
  recorder.markExecStart()

  // We re-run cmdPlan but intercept step events via a thin shim.
  // The simplest correct approach: run cmdPlan with a synthetic options object
  // that mirrors the recorded inputs, then collect outputs from the recorder.
  //
  // Because cmdPlan writes steps to contextData internally we cannot easily
  // inject a recorder callback there without restructuring plan.js further.
  // Instead we re-execute and record from scratch — the diff will surface any
  // divergence correctly.

  // Build a synthetic options object matching what the original run had
  const syntheticOptions = {
    _          : [inputs.planFile],
    model      : inputs.model,
    temperature: inputs.parameters?.temperature,
    top_p      : inputs.parameters?.top_p,
    // Pass a temp record file so plan.js writes a fresh session we can load
    record     : `__replay_tmp_${Date.now()}.json`,
  }

  if (inputs.vars) {
    syntheticOptions.vars = Object.entries(inputs.vars)
      .map(([k, v]) => `${k}=${v}`)
  }

  try {
    await cmdPlan(llm, syntheticOptions)
    const tmpSession = await loadSession(syntheticOptions.record)
    await fs.unlink(syntheticOptions.record).catch(() => {})

    // Rebuild recorder from the temp session so we get typed events
    recorder.markExecEnd()
    recorder.markLlmStart()
    recorder.markLlmEnd()
    tmpSession.events.forEach(e => recorder.events.push(e))
    recorder.setOutputs(tmpSession.outputs)
  } catch (err) {
    recorder.setOutputs({ llmResponse: '', exitCode: 1, error: err.message })
  }

  return recorder
}

// ─── Main command ─────────────────────────────────────────────────────────────

/**
 * Handle replay command
 *
 * @param {Object} llm     - LLM provider instance
 * @param {Object} options - CLI options; options._ should contain the session file path
 * @param {string} toolsDir - Tools directory (needed for chat re-execution)
 */
export async function cmdReplay(llm, options, toolsDir) {
  const positional  = options._ || []
  const sessionFile = positional[0]

  if (!sessionFile) {
    console.error('Usage: llmctl replay <session.json> [--diff]')
    process.exitCode = 1
    return
  }

  // ── Load session ────────────────────────────────────────────────────────────
  let session
  try {
    session = await loadSession(sessionFile)
  } catch (err) {
    console.error(`[replay] Failed to load session: ${err.message}`)
    process.exitCode = 1
    return
  }

  const diffMode = Boolean(options.diff)

  // ── Playback mode ───────────────────────────────────────────────────────────
  if (!diffMode) {
    playback(session)
    return
  }

  // ── Diff mode ───────────────────────────────────────────────────────────────
  console.error(`[replay] re-executing ${session.command_type} for diff…`)

  let freshRecorder
  try {
    switch (session.command_type) {
      case 'run':
        freshRecorder = await reExecuteRun(session, llm)
        break
      case 'chat':
        freshRecorder = await reExecuteChat(session, llm, toolsDir)
        break
      case 'plan':
        freshRecorder = await reExecutePlan(session, llm)
        break
      default:
        throw new Error(`Unsupported command_type: '${session.command_type}'`)
    }
  } catch (err) {
    console.error(`[replay] Re-execution failed: ${err.message}`)
    process.exitCode = 1
    return
  }

  const report = buildDiffReport(session, freshRecorder.toJSON())
  console.log(report)

  // Exit code 2 signals "differences found" to CI without being a hard error
  const hasMatch = report.includes('VERDICT: ✓ REPRODUCIBLE')
  if (!hasMatch) process.exitCode = 2
}

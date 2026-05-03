/**
 * Run command handler for llmctrlx
 *
 * Executes a shell command from the allow-list, then sends stdout to the LLM
 * for interpretation.
 *
 * Pass --record <file> to capture the full session (inputs, shell output,
 * LLM response, timestamps) into a replay-compatible JSON file.
 */

import { execFile }              from 'node:child_process'
import { promisify }             from 'node:util'
import { Recorder }              from '../core/recorder.js'

const execFileAsync = promisify(execFile)

// ─── Configuration ────────────────────────────────────────────────────────────

const ALLOWED_EXECUTABLES = new Set([
  'ls', 'cat', 'echo', 'pwd', 'date', 'whoami',
  'df', 'du', 'uname', 'uptime', 'ps',
  'git', 'node', 'npm', 'python', 'python3',
])

const MAX_OUTPUT_BYTES = 1024 * 1024 // 1 MB
const EXEC_TIMEOUT_MS  = 30_000      // 30 s
const SHELL_META_RE    = /[;&|`$<>\\!{}()\n\r]/

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validates and parses the command string.
 * Returns { executable, args } or throws an Error.
 */
function validateCommand(rawInput) {
  if (!rawInput?.trim()) {
    throw new Error('Empty command provided.')
  }

  if (SHELL_META_RE.test(rawInput)) {
    throw new Error('Command rejected: shell metacharacters are not permitted.')
  }

  const tokens = rawInput.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g)
    ?.map(t => t.replace(/^['"]|['"]$/g, '')) || []

  const [executable, ...args] = tokens

  if (!ALLOWED_EXECUTABLES.has(executable)) {
    throw new Error(`Command rejected: '${executable}' is not in the allow-list.`)
  }

  return { executable, args }
}

// ─── Main command ─────────────────────────────────────────────────────────────

/**
 * Handle run command
 *
 * @param {Object} llm         - LLM provider instance
 * @param {Object} options     - CLI options (includes options.record for session path)
 * @param {Object} engineHooks - Optional engine hook system
 */
export async function cmdRun(llm, options, engineHooks) {
  const recordFile = options.record ?? null

  // Build recorder inputs now — before any execution — so the hash
  // covers exactly what will be used to reproduce this run.
  const recorderInputs = {
    model      : options.model,
    parameters : {
      temperature : options.temperature,
      top_p       : options.top_p,
      num_ctx     : options.num_ctx,
    },
    command    : options.user,
  }

  const recorder = recordFile ? new Recorder('run', recorderInputs) : null

  try {
    const rawCommand = options.user
    const { executable, args } = validateCommand(rawCommand)

    // Hook system gate
    if (engineHooks) {
      const gate = await engineHooks.gateInference('run', rawCommand)
      if (!gate.allowed) {
        throw new Error(`Command blocked by policy: ${gate.reason}`)
      }
    }

    // ── Shell execution ───────────────────────────────────────────────────────
    if (recorder) recorder.markExecStart()

    const { stdout } = await execFileAsync(executable, args, {
      timeout     : EXEC_TIMEOUT_MS,
      maxBuffer   : MAX_OUTPUT_BYTES,
      windowsHide : true,
      env         : { ...process.env, SHLVL: '1' },
    })

    if (recorder) recorder.markExecEnd()

    // ── LLM call ─────────────────────────────────────────────────────────────
    if (recorder) recorder.markLlmStart()

    const res = await llm.chat({
      model    : options.model,
      messages : [
        { role: 'user', content: `Command output:\n${stdout}` }
      ],
    })

    if (recorder) recorder.markLlmEnd()

    const llmResponse = res.message.content
    console.log(llmResponse)

    // ── Record & save ─────────────────────────────────────────────────────────
    if (recorder) {
      recorder.setOutputs({ stdout, llmResponse, exitCode: 0 })
      await recorder.save(recordFile)
      console.error(`[record] session saved → ${recordFile}`)
    }

  } catch (err) {
    const message = err.killed
      ? `Timeout: Command exceeded ${EXEC_TIMEOUT_MS / 1000}s`
      : err.message

    console.error(`[Error] ${message}`)

    // Still save a partial session on failure so the error is replayable
    if (recorder) {
      recorder.setOutputs({ llmResponse: '', exitCode: 1, error: message })
      try {
        await recorder.save(recordFile)
        console.error(`[record] partial session saved → ${recordFile}`)
      } catch {
        // ignore save errors on failure path
      }
    }

    process.exitCode = 1
  }
}
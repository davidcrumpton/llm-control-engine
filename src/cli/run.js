import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

// --- Configuration ---
const ALLOWED_EXECUTABLES = new Set([
  'ls', 'cat', 'echo', 'pwd', 'date', 'whoami',
  'df', 'du', 'uname', 'uptime', 'ps',
  'git', 'node', 'npm', 'python', 'python3',
])

const MAX_OUTPUT_BYTES = 1024 * 1024 // 1 MB
const EXEC_TIMEOUT_MS  = 30_000      // 30s
const SHELL_META_RE    = /[;&|`$<>\\!{}()\n\r]/

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

  // Robust tokenization using regex (matches words or quoted strings)
  const tokens = rawInput.match(/[^\s"']+|"([^"]*)"|'([^']*)'/g)
    ?.map(t => t.replace(/^['"]|['"]$/g, '')) || []

  const [executable, ...args] = tokens

  if (!ALLOWED_EXECUTABLES.has(executable)) {
    throw new Error(`Command rejected: '${executable}' is not in the allow-list.`)
  }

  return { executable, args }
}

/**
 * Handle run command for llmctrlx
 */
export async function cmdRun(llm, options, engineHooks) {
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

    // Execution
    const { stdout } = await execFileAsync(executable, args, {
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true, // Prevents cmd window popups on Windows
      env: { ...process.env, SHLVL: '1' } // Consider restricting PATH here for extra security
    })

    const res = await llm.chat({
      model: options.model,
      messages: [
        { role: 'user', content: `Command output:\n${stdout}` }
      ]
    })

    console.log(res.message.content)

  } catch (err) {
    // Structured error reporting
    const message = err.killed 
      ? `Timeout: Command exceeded ${EXEC_TIMEOUT_MS / 1000}s` 
      : err.message

    console.error(`[Error] ${message}`)
    
    // If this is a CLI entry point, the caller should handle the exit code
    process.exitCode = 1 
  }
}
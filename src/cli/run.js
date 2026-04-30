/**
 * Run command handler for llmctrlx
 *
 * Security hardening:
 *   - Replaced execSync(options.user) with execFile() using a tokenized arg array.
 *     This prevents shell injection: the command string is never passed to /bin/sh.
 *   - Added an explicit allow-list of permitted executables.
 *   - Added a hard timeout so a hung subprocess cannot block the process indefinitely.
 */

import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

// ─── Security: executable allow-list ─────────────────────────────────────────
// Only programs in this set may be invoked via `llmctrlx run`.
// Extend this list deliberately; do NOT replace it with a deny-list.
const ALLOWED_EXECUTABLES = new Set([
  'ls', 'cat', 'echo', 'pwd', 'date', 'whoami',
  'df', 'du', 'uname', 'uptime', 'ps',
  'git', 'node', 'npm', 'python', 'python3',
  // add further safe executables here as needed
])

const MAX_OUTPUT_BYTES = 1 * 1024 * 1024  // 1 MB stdout cap
const EXEC_TIMEOUT_MS  = 30_000           // 30-second hard timeout

/**
 * Naively tokenise a command string into [executable, ...args].
 * Supports single- and double-quoted tokens; does NOT support
 * sub-shells, pipes, redirections, or other shell constructs —
 * those are intentionally rejected below.
 *
 * @param {string} input
 * @returns {string[]}
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

// Shell metacharacters that must never appear in the raw command string.
const SHELL_META_RE = /[;&|`$<>\\!{}()\n\r]/

/**
 * Handle run command
 * @param {Object} llm     - LLM provider instance
 * @param {Object} options - CLI options
 * @param {Object} engineHooks - Engine hooks integration for plugin system
 */
export async function cmdRun(llm, options, engineHooks) {
  if (!options.user) {
    console.error('Provide command with -u')
    process.exit(1)
  }

  const rawCommand = options.user

  // ── Guard 1: reject shell metacharacters before any parsing ──────────────
  if (SHELL_META_RE.test(rawCommand)) {
    console.error(
      'Command rejected: shell metacharacters are not permitted. ' +
      'Provide a plain command and arguments only.'
    )
    process.exit(1)
  }

  // ── Guard 2: tokenise without involving a shell ───────────────────────────
  const [executable, ...args] = tokenise(rawCommand)

  if (!executable) {
    console.error('Command rejected: empty command.')
    process.exit(1)
  }

  // ── Guard 3: allow-list check ─────────────────────────────────────────────
  if (!ALLOWED_EXECUTABLES.has(executable)) {
    console.error(
      `Command rejected: '${executable}' is not in the allowed-executable list.`
    )
    process.exit(1)
  }

  // ── Guard 4: hook-system gate (unchanged) ─────────────────────────────────
  if (engineHooks) {
    const gate = await engineHooks.gateInference('run', rawCommand)
    if (!gate.allowed) {
      console.error(`Command blocked: ${gate.reason}`)
      process.exit(1)
    }
  }

  // ── Execute without a shell ───────────────────────────────────────────────
  let output
  try {
    const result = await execFileAsync(executable, args, {
      timeout:   EXEC_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      // Deliberately no `shell` option — defaults to false
    })
    output = result.stdout
  } catch (err) {
    if (err.killed) {
      console.error(`Command timed out after ${EXEC_TIMEOUT_MS / 1000}s.`)
    } else {
      console.error(`Command failed (exit ${err.code}): ${err.stderr || err.message}`)
    }
    process.exit(1)
  }

  const res = await llm.chat({
    model: options.model,
    messages: [
      { role: 'user', content: `Command output:\n${output}` }
    ]
  })

  console.log(res.message.content)
}

/**
 * Differ — textual diff utilities for llmctrlx replay
 *
 * Produces human-readable output when `llmctl replay session.json --diff`
 * re-executes a recorded run and compares fresh results against the stored ones.
 *
 * Uses a simple Myers-style line diff (no external dependency required).
 * For large outputs the diff is truncated with a clear notice.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_DIFF_LINES  = 200   // lines shown before truncation
const CONTEXT_LINES   = 3     // unchanged lines shown around each change

// ─── Core line diff ──────────────────────────────────────────────────────────

/**
 * Compute the longest-common-subsequence edit script between two line arrays.
 * Returns an array of { type: 'equal'|'insert'|'delete', line } objects.
 *
 * This is a classic DP LCS approach; fast enough for typical LLM output sizes.
 *
 * @param {string[]} aLines
 * @param {string[]} bLines
 * @returns {Array<{ type: string, line: string }>}
 */
function lcsEditScript(aLines, bLines) {
  const m = aLines.length
  const n = bLines.length

  // Build LCS table
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = aLines[i - 1] === bLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1])
    }
  }

  // Traceback
  const edits = []
  let i = m, j = n
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
      edits.push({ type: 'equal', line: aLines[i - 1] })
      i--; j--
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      edits.push({ type: 'insert', line: bLines[j - 1] })
      j--
    } else {
      edits.push({ type: 'delete', line: aLines[i - 1] })
      i--
    }
  }

  return edits.reverse()
}

// ─── Unified diff formatter ───────────────────────────────────────────────────

/**
 * Produce a unified-diff string between `oldText` and `newText`.
 *
 * @param {string} oldText    - The recorded (expected) text
 * @param {string} newText    - The fresh (actual) text
 * @param {string} [label]    - Label shown in the diff header
 * @returns {string}          - Human-readable diff, or empty string if identical
 */
export function unifiedDiff(oldText, newText, label = '') {
  if (oldText === newText) return ''

  const aLines = oldText.split('\n')
  const bLines = newText.split('\n')
  const edits  = lcsEditScript(aLines, bLines)

  // Collect hunks (groups of changes with CONTEXT_LINES of surrounding context)
  const lines  = []
  let changed  = false

  // Mark which edit indices are changed
  const isChanged = edits.map(e => e.type !== 'equal')

  // Build display with context
  let prev = -Infinity
  for (let idx = 0; idx < edits.length; idx++) {
    const edit = edits[idx]

    // Check if this line is near a change
    const nearChange = isChanged.slice(
      Math.max(0, idx - CONTEXT_LINES),
      Math.min(edits.length, idx + CONTEXT_LINES + 1)
    ).some(Boolean)

    if (!nearChange) continue

    if (idx - prev > CONTEXT_LINES + 1 && prev !== -Infinity) {
      lines.push('  ───')
    }
    prev = idx

    if (edit.type === 'equal')  lines.push(`    ${edit.line}`)
    if (edit.type === 'delete') { lines.push(`  - ${edit.line}`); changed = true }
    if (edit.type === 'insert') { lines.push(`  + ${edit.line}`); changed = true }

    if (lines.length >= MAX_DIFF_LINES) {
      lines.push(`  … (diff truncated at ${MAX_DIFF_LINES} lines)`)
      break
    }
  }

  if (!changed) return ''

  const header = label ? `── diff: ${label} ──\n` : '── diff ──\n'
  return header + lines.join('\n')
}

// ─── Tool call diff ───────────────────────────────────────────────────────────

/**
 * Compare two arrays of tool-call events.
 * Returns a structured summary — not a text diff — because tool call
 * sequences are structural, not textual.
 *
 * @param {Array} recorded  - events[] from the session file (type === 'tool_call')
 * @param {Array} fresh     - events[] collected by a fresh Recorder
 * @returns {{ match: boolean, summary: string }}
 */
export function diffToolCalls(recorded, fresh) {
  const rec   = recorded.filter(e => e.type === 'tool_call')
  const frsh  = fresh.filter(e => e.type === 'tool_call')
  const lines = []
  let match   = true

  const maxLen = Math.max(rec.length, frsh.length)

  if (maxLen === 0) return { match: true, summary: '  (no tool calls in either run)' }

  for (let i = 0; i < maxLen; i++) {
    const r = rec[i]
    const f = frsh[i]

    if (!r) {
      lines.push(`  + [${i + 1}] NEW   ${f.tool}(${JSON.stringify(f.args)})`)
      match = false
      continue
    }
    if (!f) {
      lines.push(`  - [${i + 1}] GONE  ${r.tool}(${JSON.stringify(r.args)})`)
      match = false
      continue
    }

    const toolMatch   = r.tool === f.tool
    const argsMatch   = JSON.stringify(r.args) === JSON.stringify(f.args)
    const resultMatch = r.result === f.result

    if (toolMatch && argsMatch && resultMatch) {
      lines.push(`  = [${i + 1}] OK    ${r.tool}`)
    } else {
      match = false
      lines.push(`  ~ [${i + 1}] DIFF  recorded: ${r.tool}(${JSON.stringify(r.args)})`)
      lines.push(`           fresh:    ${f.tool}(${JSON.stringify(f.args)})`)
      if (!resultMatch) {
        lines.push(`           result changed`)
        const resultDiff = unifiedDiff(r.result, f.result, 'tool result')
        if (resultDiff) lines.push(resultDiff)
      }
    }
  }

  return { match, summary: lines.join('\n') }
}

// ─── Plan step diff ───────────────────────────────────────────────────────────

/**
 * Compare two arrays of step events.
 *
 * @param {Array} recorded
 * @param {Array} fresh
 * @returns {{ match: boolean, summary: string }}
 */
export function diffSteps(recorded, fresh) {
  const rec   = recorded.filter(e => e.type === 'step')
  const frsh  = fresh.filter(e => e.type === 'step')
  const lines = []
  let match   = true

  const maxLen = Math.max(rec.length, frsh.length)
  if (maxLen === 0) return { match: true, summary: '  (no steps in either run)' }

  for (let i = 0; i < maxLen; i++) {
    const r = rec[i]
    const f = frsh[i]

    if (!r) { lines.push(`  + step ADDED:   ${f.stepName}`); match = false; continue }
    if (!f) { lines.push(`  - step REMOVED: ${r.stepName}`); match = false; continue }

    const stdoutMatch = r.stdout === f.stdout
    const exitMatch   = r.exitCode === f.exitCode

    if (stdoutMatch && exitMatch) {
      lines.push(`  = [${i + 1}] OK    ${r.stepName}`)
    } else {
      match = false
      lines.push(`  ~ [${i + 1}] DIFF  ${r.stepName}`)
      if (!exitMatch) lines.push(`           exit: recorded=${r.exitCode} fresh=${f.exitCode}`)
      if (!stdoutMatch) {
        const d = unifiedDiff(r.stdout || '', f.stdout || '', 'stdout')
        if (d) lines.push(d)
      }
    }
  }

  return { match, summary: lines.join('\n') }
}

// ─── Hash comparison ─────────────────────────────────────────────────────────

/**
 * Compare recorded and fresh run hashes and produce a one-line verdict.
 *
 * @param {string} recordedHash
 * @param {string} freshHash
 * @returns {string}
 */
export function hashVerdict(recordedHash, freshHash) {
  if (recordedHash === freshHash) {
    return `✓ runHash matches — inputs are identical`
  }
  return `✗ runHash MISMATCH\n  recorded : ${recordedHash}\n  fresh    : ${freshHash}`
}

// ─── Top-level diff report ────────────────────────────────────────────────────

/**
 * Build a complete human-readable diff report for replay --diff mode.
 *
 * @param {Object} session      - Loaded session envelope (recorded)
 * @param {Object} freshSession - toJSON() of a fresh Recorder (re-executed)
 * @returns {string}
 */
export function buildDiffReport(session, freshSession) {
  const sections = []

  sections.push('══════════════════════════════════════════')
  sections.push(' REPLAY DIFF REPORT')
  sections.push(`  command_type : ${session.command_type}`)
  sections.push(`  recorded at  : ${session.recordedAt}`)
  sections.push('══════════════════════════════════════════')

  // 1. Input hash
  sections.push('\n── Inputs ──')
  sections.push(hashVerdict(session.runHash, freshSession.runHash))

  // 2. Tool calls (chat / run-with-tools)
  const toolEvents = session.events.filter(e => e.type === 'tool_call')
  if (toolEvents.length > 0 || freshSession.events.filter(e => e.type === 'tool_call').length > 0) {
    sections.push('\n── Tool Calls ──')
    const { match, summary } = diffToolCalls(session.events, freshSession.events)
    sections.push(match ? '  ✓ identical' : summary)
  }

  // 3. Plan steps
  const stepEvents = session.events.filter(e => e.type === 'step')
  if (stepEvents.length > 0 || freshSession.events.filter(e => e.type === 'step').length > 0) {
    sections.push('\n── Plan Steps ──')
    const { match, summary } = diffSteps(session.events, freshSession.events)
    sections.push(match ? '  ✓ identical' : summary)
  }

  // 4. Shell stdout (run command)
  if (session.outputs.stdout !== undefined) {
    sections.push('\n── Shell stdout ──')
    const d = unifiedDiff(
      session.outputs.stdout    || '',
      freshSession.outputs.stdout || '',
      'stdout'
    )
    sections.push(d || '  ✓ identical')
  }

  // 5. LLM response
  sections.push('\n── LLM Response ──')
  const llmDiff = unifiedDiff(
    session.outputs.llmResponse    || '',
    freshSession.outputs.llmResponse || '',
    'llmResponse'
  )
  sections.push(llmDiff || '  ✓ identical')

  // 6. Overall verdict
  const allMatch =
    session.runHash === freshSession.runHash &&
    !llmDiff &&
    !(session.outputs.stdout !== undefined &&
      session.outputs.stdout !== freshSession.outputs.stdout)

  sections.push('\n══════════════════════════════════════════')
  sections.push(allMatch ? ' VERDICT: ✓ REPRODUCIBLE' : ' VERDICT: ✗ DIFFERENCES FOUND')
  sections.push('══════════════════════════════════════════')

  return sections.join('\n')
}

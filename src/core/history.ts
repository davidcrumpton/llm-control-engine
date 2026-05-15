/**
 * Session history management for llmctrlx
 *
 * Security hardening:
 *   - loadHistory() wraps JSON.parse in try/catch to prevent crashes on corrupted files.
 *   - Top-level structure is validated; must be a plain object with session values.
 *   - Individual messages are sanitised before being returned, preventing
 *     injected content from manipulating LLM conversations.
 *   - getSession() coerces the messages array to a valid structure rather
 *     than trusting whatever shape was on disk.
 */

import fs from 'fs'
import { ChatMessage, HistoryRecord, HistorySession, MessageRole } from '../types.js'

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Return true if `value` is a plain (non-null, non-array) object.
 */
function isPlainObject(
  value: unknown
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  )
}

const ALLOWED_ROLES = new Set<MessageRole>([
  'user',
  'assistant',
  'system',
  'tool',
])

/**
 * Sanitise a single message object.
 *
 * Rules:
 *  - `role` must be one of the known LLM roles; any other value is replaced
 *    with 'user' so the message is not silently dropped.
 *  - `content` must be a string; non-string values are JSON-stringified so
 *    that no object prototype methods are accessible via the conversation.
 *  - Unknown fields are stripped to avoid unexpected behaviour in providers.
 *
 * @returns Sanitised message or null to skip this entry
 */
function sanitiseMessage(msg: unknown): ChatMessage | null {
  if (!isPlainObject(msg)) return null

  const role: MessageRole = ALLOWED_ROLES.has(msg.role as MessageRole)
    ? (msg.role as MessageRole)
    : 'user'

  let content: string
  if (typeof msg.content === 'string') {
    content = msg.content
  } else if (msg.content !== undefined && msg.content !== null) {
    // Flatten non-string content to a string representation.
    try {
      content = JSON.stringify(msg.content)
    } catch {
      content = String(msg.content)
    }
  } else {
    return null // message has no usable content — skip
  }

  return { role, content }
}

/**
 * Validate and sanitise the top-level history object parsed from disk.
 */
function validateHistory(parsed: unknown): HistoryRecord {
  if (!isPlainObject(parsed)) {
    if (Object.keys(parsed as any).length === 0) {
      return {}
    }
    console.warn(
      'WARN: History file does not contain a valid object; starting with empty history.'
    )
    return {}
  }

  const validated: HistoryRecord = {}

  for (const [key, session] of Object.entries(parsed)) {
    if (!isPlainObject(session)) continue

    const rawMessages = Array.isArray(session.messages)
      ? session.messages
      : []
    const messages = rawMessages
      .map(sanitiseMessage)
      .filter((m): m is ChatMessage => m !== null)

    validated[key] = {
      session:
        typeof session.session === 'string' ? session.session : key,
      messages,
    }
  }

  return validated
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Load chat history from file.
 *
 * Never throws: returns an empty object if the file is missing, unreadable,
 * or contains invalid JSON/structure.
 */
export function loadHistory(file: string): HistoryRecord {
  if (!fs.existsSync(file)) return {}

  // If file is /dev/null return empty object
  // /dev/null not on Windows, but it's a common way to disable history on Linux/MacOS.
  // On Windows, use NUL
  if (file === '/dev/null' || file === 'NUL') return {}

  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(
      `WARN: Cannot read history file '${file}': ${message}`
    )
    return {}
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn(
      `WARN: History file '${file}' contains invalid JSON; starting fresh. (${message})`
    )
    return {}
  }

  return validateHistory(parsed)
}

/**
 * Save chat history to file.
 */
export function saveHistory(
  file: string,
  data: HistoryRecord
): void {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
  } catch {
    console.warn("WARN: Can't save history file")
  }
}

/**
 * Get or create a session in the history.
 */
export function getSession(
  history: HistoryRecord,
  key: string
): HistorySession {
  if (!history[key] || !isPlainObject(history[key])) {
    history[key] = { session: key, messages: [] }
  } else {
    const session = history[key] as any
    // Ensure session always has a valid messages array.
    if (!Array.isArray(session.messages)) {
      session.messages = []
    }
    if (!session.session) {
      session.session = key
    }
  }
  return history[key]
}

/**
 * Get a slice of the session history messages based on the requested length.
 *
 * @param session - Session object from history
 * @param historyLengthArg - Requested history length (defaults to 5). 0 means all history.
 * @returns Slice of messages
 */
export function getHistoryWindow(
  session: HistorySession,
  historyLengthArg: string | number
): ChatMessage[] {
  const length = parseInt(String(historyLengthArg), 10)
  const limit = Number.isNaN(length) ? 5 : Math.max(0, length)
  if (
    !session.messages ||
    session.messages.length === 0 ||
    limit === -1
  )
    return []
  return limit === 0
    ? session.messages
    : session.messages.slice(-limit)
}

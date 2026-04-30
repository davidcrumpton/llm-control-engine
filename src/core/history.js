/**
 * Session history management for llmctrlx
 *
 * Security hardening:
 *   - loadHistory() now wraps JSON.parse in try/catch.  A corrupted or
 *     maliciously crafted history file no longer crashes the process.
 *   - After parsing, the top-level structure is validated: it must be a
 *     plain object whose values are session objects.
 *   - Individual session messages are sanitised before being returned so
 *     that injected content in a stored history file cannot trivially
 *     manipulate the LLM conversation that is reconstructed from it.
 *   - getSession() coerces the messages array to a valid structure rather
 *     than trusting whatever shape was on disk.
 */

import fs from 'fs'

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Return true if `value` is a plain (non-null, non-array) object.
 */
function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const ALLOWED_ROLES = new Set(['user', 'assistant', 'system', 'tool'])

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
 * @param {unknown} msg
 * @returns {{ role: string, content: string } | null}  null = skip this entry
 */
function sanitiseMessage(msg) {
  if (!isPlainObject(msg)) return null

  const role = ALLOWED_ROLES.has(msg.role) ? msg.role : 'user'

  let content
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
 *
 * @param {unknown} parsed
 * @returns {Object} Always a plain object (possibly empty).
 */
function validateHistory(parsed) {
  if (!isPlainObject(parsed)) {
    console.warn('WARN: History file does not contain a valid object; starting with empty history.')
    return {}
  }

  const validated = {}

  for (const [key, session] of Object.entries(parsed)) {
    if (!isPlainObject(session)) continue

    const rawMessages = Array.isArray(session.messages) ? session.messages : []
    const messages = rawMessages
      .map(sanitiseMessage)
      .filter(Boolean) // drop null entries

    validated[key] = {
      session: typeof session.session === 'string' ? session.session : key,
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
 *
 * @param {string} file - Path to history file.
 * @returns {Object}    - Validated history object.
 */
export function loadHistory(file) {
  if (!fs.existsSync(file)) return {}

  let raw
  try {
    raw = fs.readFileSync(file, 'utf8')
  } catch (err) {
    console.warn(`WARN: Cannot read history file '${file}': ${err.message}`)
    return {}
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    console.warn(`WARN: History file '${file}' contains invalid JSON; starting fresh. (${err.message})`)
    return {}
  }

  return validateHistory(parsed)
}

/**
 * Save chat history to file.
 *
 * @param {string} file - Path to history file.
 * @param {Object} data - History data to save.
 */
export function saveHistory(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
  } catch {
    console.warn("WARN: Can't save history file")
  }
}

/**
 * Get or create a session in the history.
 *
 * @param {Object} history - Validated history object.
 * @param {string} key     - Session key/name.
 * @returns {{ session: string, messages: Array }}
 */
export function getSession(history, key) {
  if (!history[key] || !isPlainObject(history[key])) {
    history[key] = { session: key, messages: [] }
  } else {
    // Ensure session always has a valid messages array.
    if (!Array.isArray(history[key].messages)) {
      history[key].messages = []
    }
    if (!history[key].session) {
      history[key].session = key
    }
  }
  return history[key]
}

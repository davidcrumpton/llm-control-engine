/**
 * Session history management for llmctrlx
 * Handles loading, saving, and retrieving chat sessions
 */

import fs from 'fs'

/**
 * Load chat history from file
 * @param {string} file - Path to history file
 * @returns {Object} - History object with sessions
 */
export function loadHistory(file) {
  if (!fs.existsSync(file)) return {}
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/**
 * Save chat history to file
 * @param {string} file - Path to history file
 * @param {Object} data - History data to save
 */
export function saveHistory(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2))
  } catch {
    console.log("WARN: Can't save history file");
  }
}

/**
 * Get or create a session in the history
 * @param {Object} history - History object
 * @param {string} key - Session key/name
 * @returns {Object} - Session object with messages array
 */
export function getSession(history, key) {
  if (!history[key]) {
    history[key] = { session: key, messages: [] }
  } else if (!history[key].session) {
    history[key].session = key
  }
  return history[key]
}

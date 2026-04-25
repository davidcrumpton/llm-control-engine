/**
 * History command handler for llmctrlx
 */

import { loadHistory, getSession } from '../core/history.js'

/**
 * Handle history command
 * @param {Object} options - CLI options
 * @param {string} defaultHistoryFile - Default history file path
 */
export function cmdHistory(options, defaultHistoryFile) {
  const historyData = loadHistory(defaultHistoryFile)

  if (options.all) {
    console.log(JSON.stringify(historyData, null, 2))
    return
  }

  if (options.list) {
    console.log(Object.keys(historyData).join('\n'))
    return
  }

  const sessionKey = options.show ? options.show : options.session
  const session = getSession(historyData, sessionKey)
  console.log(JSON.stringify(session, null, 2))
}

/**
 * History command handler for llmctrlx
 */

import { loadHistory, saveHistory, getSession } from '../core/history.js'

/**
 * Handle history command
 * @param {Object} options - CLI options
 * @param {string} defaultHistoryFile - Default history file path
 */
export function cmdHistory(options, defaultHistoryFile) {
  const historyData = loadHistory(defaultHistoryFile)

  if (options.purge) {
    saveHistory(defaultHistoryFile, {})
    console.log('History purged successfully.')
    return
  }

  if (options.delete) {
    if (!options.delete) {
      console.error('Please specify a session to delete with --delete <session_name>')
      return
    }
    const sessionKey = options.session ? options.session : options.delete
    if (!historyData[sessionKey]) {
      console.error(`Session not found: ${sessionKey}`)
      return
    }
    delete historyData[sessionKey]
    console.log(`Deleted session from permanent storage: ${sessionKey}`)
    saveHistory( defaultHistoryFile, historyData)
    return
  }

  if (options.all) {
    console.log(JSON.stringify(historyData, null, 2))
    return
  }

  if (options.list) {
    console.log(Object.keys(historyData).join('\n'))
    return
  }
  
  if (options.show || options.session) {
    const sessionKey = options.session ? options.session : options.show
    const session = getSession(historyData, sessionKey)
    if (!session.messages || session.messages.length === 0) {
      console.error(`No messages found for session: ${sessionKey}`)
      return
    }
    console.log(JSON.stringify(session, null, 2))
    return
  }
// If no options are provided, show usage
  console.log('Usage: llmctrlx history [--list | --show <session_name> | --delete <session_name> | --all]')
  console.log('--list: List all session keys')
  console.log('--show <session_name>: Show details of a specific session')
  console.log('--delete <session_name>: Delete a specific session from permanent storage')
  console.log('--all: Show entire history data')
}

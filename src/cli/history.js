/**
 * History command handler for llmctrlx
 */
import { loadHistory, saveHistory, getSession } from '../core/history.js';

/**
 * Handle history command
 * @param {Object} options - CLI options
 * @param {string} historyFile - Path to the history file
 */
export function cmdHistory(options, historyFile) {
  const historyData = loadHistory(historyFile);

  // 1. Destructive Actions (Purge/Delete)
  if (options.purge) {
    saveHistory(historyFile, {});
    return console.log('History purged successfully.');
  }

  if (options.delete) {
    const sessionKey = typeof options.delete === 'string' ? options.delete : options.session;
    
    if (!sessionKey) {
      return console.error('Error: Please specify a session to delete with --delete <session_name>');
    }
    if (!historyData[sessionKey]) {
      return console.error(`Error: Session not found: ${sessionKey}`);
    }

    delete historyData[sessionKey];
    saveHistory(historyFile, historyData);
    return console.log(`Deleted session: ${sessionKey}`);
  }

  // 2. View Actions (List/All/Show)
  if (options.all) {
    return console.log(JSON.stringify(historyData, null, 2));
  }

  if (options.list) {
    const keys = Object.keys(historyData);
    return console.log(keys.length ? keys.join('\n') : 'No sessions found.');
  }

  if (options.show || options.session) {
    const sessionKey = options.session || options.show;
    const session = getSession(historyData, sessionKey);

    if (!session?.messages?.length) {
      return console.error(`No messages found for session: ${sessionKey}`);
    }
    return console.log(JSON.stringify(session, null, 2));
  }

  // 3. Default: Show Help
  printUsage();
}

function printUsage() {
  console.log(`
Usage: llmctrlx history [options]

Options:
  --list                List all session keys
  --show <name>         Show details of a specific session
  --delete <name>       Delete a specific session
  --purge               Clear all history
  --all                 Show entire history JSON
  `);
}
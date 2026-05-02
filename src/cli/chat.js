/**
 * Chat command handler for llmctrlx
 */

import fs from 'fs'
import { loadHistory, saveHistory, getSession } from '../core/history.js'
import { buildOptions, isImage, validateFileSize, buildToolPrompt, buildImageMessage } from '../core/utils.js'
import { createPluginRegistry, runWithTools, runWithoutTools } from '../core/tools.js'

/**
 * Handle chat command
 * @param {Object} llm - LLM provider instance
 * @param {Object} options - CLI options
 * @param {string} defaultHistoryFile - Default history file path
 * @param {string} toolsDir - Default tools directory
 * @param {number} maxUploadFileSize - Maximum file upload size
 * @param {Object} engineHooks - Engine hooks integration
 */
export async function cmdChat(llm, options, defaultHistoryFile, toolsDir, maxUploadFileSize, engineHooks) {
  const historyData = loadHistory(defaultHistoryFile)
  const session = getSession(historyData, options.session)

  // Helper function to filter response through plugins
  async function filterResponse(content) {
    if (!engineHooks) return content;
    const payload = { content, filtered: false, requestMeta: { flags: options } };
    const filtered = await engineHooks.filterResponse('chat', payload);
    return filtered.content;
  }

  const messages = []

  if (options.system) {
    messages.push({ role: 'system', content: options.system })
  }
  // Use number of message in opyions.history_length with 0 as all, default to 5 if not specified
   const history_length = Number.isNaN(parseInt(options.history_length)) ? 5 : Math.max(0, parseInt(options.history_length))

   if (history_length > 0 && session.messages && session.messages.length > 0) {
     const recentMessages = session.messages.slice(-history_length)
      messages.push(...recentMessages)
    } else if (history_length === 0 && session.messages && session.messages.length > 0) {
      messages.push(...session.messages)
    }

  let userInput = options.user

  let stdinContent = null
  // Using async events from process.stdin to ensure we don't throw EAGAIN
  // if the pipe is not immediately ready on certain platforms

  if (options.stdin) {
    if (!process.stdin.isTTY) {
      stdinContent = await new Promise((resolve) => {
        let data = ''
        process.stdin.on('data', chunk => data += chunk)
        process.stdin.on('end', () => resolve(data))
      })
    } else {
      console.error('--stdin specified but no stdin input detected')
      process.exit(1)
    }
  } else if (!userInput && !process.stdin.isTTY) {
    userInput = await new Promise((resolve) => {
      let data = ''
      process.stdin.on('data', chunk => data += chunk)
      process.stdin.on('end', () => resolve(data))
    })
  }

  let userContent = ''
  if (userInput) {
    userContent = `Instruction: ${userInput}`
  }
  if (stdinContent) {
    if (userContent) userContent += '\n\n'
    userContent += `Input data:\n${stdinContent}`
  }

  if (!userContent) {
    console.error('No input provided')
    process.exit(1)
  }

  const files = options.files
    ? (Array.isArray(options.files) ? options.files : [options.files])
    : []

  for (const file of files) {
    try {
      validateFileSize(file, maxUploadFileSize)
    } catch (e) {
      console.error(`Skipping ${file} due to size error: ${e.message}`)
      process.exit(1)
    }

    if (isImage(file)) {
      const img = fs.readFileSync(file).toString('base64')
      const provider = (options.provider || 'ollama').toLowerCase()
      messages.push(buildImageMessage(file, img, provider))

    } else {
      const content = fs.readFileSync(file, 'utf8')

      messages.push({
        role: 'user',
        content: `File: ${file}\n${content}`
      })
    }
  }

  if (userContent) {
    messages.push({ role: 'user', content: userContent })
  }

  const chatOptions = buildOptions(options)

  // fix streaming to error if lmstudio is the provider and stream is true, since lmstudio does not support streaming
  if (options.stream) {
    const stream = await llm.chat({
      model: options.model,
      messages,
      stream: true,
      options: chatOptions
    })

    let full = ''

    for await (const chunk of stream) {
      process.stdout.write(chunk.message.content)
      full += chunk.message.content
    }

    const filtered = await filterResponse(full);

    session.messages.push({ role: 'user', content: userContent })
    session.messages.push({ role: 'assistant', content: filtered })
  } else {
    if (!options.no_tools) {
      const requestedTags = options.tags ? options.tags.split(',').map(t => t.trim()) : null
      const registry = await createPluginRegistry(toolsDir, options.session)
      let tools = registry.list('tool')

      if (requestedTags) {
        tools = tools.filter(tool => {
          const toolTags = tool.tags || []
          const hasAlways = toolTags.includes('always')
          const hasMatch = requestedTags.some(tag => toolTags.includes(tag))
          return hasAlways || hasMatch
        })
      }

      messages.unshift({
        role: 'system',
        content: buildToolPrompt(tools)
      })

      const policyPlugins = registry.list('policy')
      const res = await runWithTools(llm, options.model, messages, tools, policyPlugins, chatOptions)
      const filtered = await filterResponse(res);
      console.log(filtered)

      session.messages.push({ role: 'user', content: userContent })
      session.messages.push({ role: 'assistant', content: filtered })
    } else {
      const res = await runWithoutTools(llm, options.model, messages, chatOptions)
      const filtered = await filterResponse(res);
      console.log(filtered)

      session.messages.push({ role: 'user', content: userContent })
      session.messages.push({ role: 'assistant', content: filtered })
    }
  }

  saveHistory(defaultHistoryFile, historyData)
}
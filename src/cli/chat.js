import fs from 'fs/promises' // Use promise-based FS
import { loadHistory, saveHistory, getSession } from '../core/history.js'
import { buildOptions, isImage, validateFileSize, buildToolPrompt, buildImageMessage } from '../core/utils.js'
import { createPluginRegistry, runWithTools, runWithoutTools } from '../core/tools.js'

/**
 * Handle chat command
 */
export async function cmdChat(llm, options, defaultHistoryFile, toolsDir, maxUploadFileSize, engineHooks) {
  const historyData = loadHistory(defaultHistoryFile)
  const session = getSession(historyData, options.session)
  
  // 1. Prepare Input (Stdin + User Text)
  const userContent = await resolveUserContent(options)
  if (!userContent) {
    console.error('Error: No input provided via CLI or stdin.')
    process.exit(1)
  }

  // 2. Build Message Context
  const messages = []
  if (options.system) messages.push({ role: 'system', content: options.system })
  
  // Attach History
  messages.push(...getHistoryWindow(session, options.history_length))

  // Attach Files
  const fileMessages = await processFiles(options.files, maxUploadFileSize, options.provider)
  messages.push(...fileMessages)

  // Final User Input
  messages.push({ role: 'user', content: userContent })

  // 3. Execute LLM Request
  const chatOptions = buildOptions(options)
  let assistantResponse = ''

  if (options.stream) {
    assistantResponse = await handleStreamingChat(llm, options, messages, chatOptions)
  } else {
    assistantResponse = await handleStandardChat(llm, options, messages, chatOptions, toolsDir)
  }

  // 4. Post-processing & Persistence
  const filtered = await filterResponse(assistantResponse, engineHooks, options)
  
  // Only log if not already printed by stream
  if (!options.stream) console.log(filtered)

  session.messages.push({ role: 'user', content: userContent })
  session.messages.push({ role: 'assistant', content: filtered })
  saveHistory(defaultHistoryFile, historyData)
}

/**
 * Logic to extract content from stdin or CLI arguments
 */
async function resolveUserContent(options) {
  let stdinData = ''
  if (options.stdin || (!options.user && !process.stdin.isTTY)) {
    stdinData = await new Promise((resolve) => {
      let data = ''
      process.stdin.on('data', chunk => data += chunk)
      process.stdin.on('end', () => resolve(data.trim()))
    })
    if (options.stdin && !stdinData && process.stdin.isTTY) {
      console.error('--stdin specified but no input detected')
      process.exit(1)
    }
  }

  const parts = [options.user, stdinData].filter(Boolean)
  return parts.join('\n\n')
}

/**
 * Determines how many historical messages to include
 */
function getHistoryWindow(session, historyLengthArg) {
  const length = parseInt(historyLengthArg)
  const limit = Number.isNaN(length) ? 5 : Math.max(0, length)
  
  if (!session.messages || session.messages.length === 0 || limit === -1) return []
  return limit === 0 ? session.messages : session.messages.slice(-limit)
}

/**
 * Processes files (Images vs Text) into message objects
 */
async function processFiles(filesInput, maxSize, provider = 'ollama') {
  const files = Array.isArray(filesInput) ? filesInput : (filesInput ? [filesInput] : [])
  const msgs = []

  for (const file of files) {
    validateFileSize(file, maxSize)
    
    if (isImage(file)) {
      const img = (await fs.readFile(file)).toString('base64')
      msgs.push(buildImageMessage(file, img, provider.toLowerCase()))
    } else {
      const content = await fs.readFile(file, 'utf8')
      msgs.push({ role: 'user', content: `File: ${file}\n${content}` })
    }
  }
  return msgs
}

/**
 * Handles non-streaming logic (with or without tools)
 */
async function handleStandardChat(llm, options, messages, chatOptions, toolsDir) {
  if (options.no_tools) {
    return await runWithoutTools(llm, options.model, messages, chatOptions)
  }

  const registry = await createPluginRegistry(toolsDir, options.session)
  const requestedTags = options.tags?.split(',').map(t => t.trim())
  
  let tools = registry.list('tool')
  if (requestedTags) {
    tools = tools.filter(t => 
      (t.tags || []).includes('always') || 
      requestedTags.some(tag => (t.tags || []).includes(tag))
    )
  }

  messages.unshift({ role: 'system', content: buildToolPrompt(tools) })
  return await runWithTools(llm, options.model, messages, tools, registry.list('policy'), chatOptions)
}

/**
 * Handles streaming logic
 */
async function handleStreamingChat(llm, options, messages, chatOptions) {
  const stream = await llm.chat({
    model: options.model,
    messages,
    stream: true,
    options: chatOptions
  })

  let fullContent = ''
  for await (const chunk of stream) {
    const content = chunk.message?.content || ''
    process.stdout.write(content)
    fullContent += content
  }
  process.stdout.write('\n')
  return fullContent
}

/**
 * Engine Hook filter wrapper
 */
async function filterResponse(content, engineHooks, options) {
  if (!engineHooks) return content
  const result = await engineHooks.filterResponse('chat', {
    content,
    filtered: false,
    requestMeta: { flags: options }
  })
  return result.content
}
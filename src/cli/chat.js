/**
 * Chat command handler for llmctrlx
 */

import fs from 'fs'
import { loadHistory, saveHistory, getSession } from '../core/history.js'
import { buildOptions, isImage, validateFileSize, buildToolPrompt } from '../core/utils.js'
import { loadTools, runWithTools, runWithoutTools } from '../core/tools.js'

/**
 * Handle chat command
 * @param {Object} llm - LLM provider instance
 * @param {Object} options - CLI options
 * @param {string} defaultHistoryFile - Default history file path
 * @param {string} toolsDir - Default tools directory
 * @param {number} maxUploadFileSize - Maximum file upload size
 */
export async function cmdChat(llm, options, defaultHistoryFile, toolsDir, maxUploadFileSize) {
  const historyData = loadHistory(defaultHistoryFile)
  const session = getSession(historyData, options.session)

  const messages = []

  if (options.system) {
    messages.push({ role: 'system', content: options.system })
  }

  messages.push(...session.messages)

  let userInput = options.user

  if (!userInput && !process.stdin.isTTY) {
    userInput = fs.readFileSync(0, 'utf8')
  }

  if (!userInput) {
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

      messages.push({
        role: 'user',
        content: 'Describe this image',
        images: [img]
      })

    } else {
      const content = fs.readFileSync(file, 'utf8')

      messages.push({
        role: 'user',
        content: `File: ${file}\n${content}`
      })
    }
  }

  if (userInput) {
    messages.push({ role: 'user', content: userInput })
  }

  const chatOptions = buildOptions(options)

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

    session.messages.push({ role: 'user', content: userInput })
    session.messages.push({ role: 'assistant', content: full })
  } else {
    if (!options.no_tools) {
      const requestedTags = options.tags ? options.tags.split(',').map(t => t.trim()) : null
      const tools = await loadTools(toolsDir, requestedTags)

      messages.unshift({
        role: 'system',
        content: buildToolPrompt(tools)
      })

      const res = await runWithTools(llm, options.model, messages, tools)
      console.log(res)

      session.messages.push({ role: 'user', content: userInput })
      session.messages.push({ role: 'assistant', content: res })
    } else {
      const res = await runWithoutTools(llm, options.model, messages)
      console.log(res)

      session.messages.push({ role: 'user', content: userInput })
      session.messages.push({ role: 'assistant', content: res })
    }
  }

  saveHistory(defaultHistoryFile, historyData)
}

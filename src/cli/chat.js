/**
 * Chat command handler for llmctrlx
 */

import fs from 'fs'
import { loadHistory, saveHistory, getSession } from '../core/history.js'
import { buildOptions, isImage, validateFileSize, buildToolPrompt } from '../core/utils.js'
import { createPluginRegistry, runWithTools, runWithoutTools } from '../core/tools.js'

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

  let stdinContent = null

  if (options.stdin) {
    if (!process.stdin.isTTY) {
      stdinContent = fs.readFileSync(0, 'utf8')
    } else {
      console.error('--stdin specified but no stdin input detected')
      process.exit(1)
    }
  } else if (!userInput && !process.stdin.isTTY) {
    userInput = fs.readFileSync(0, 'utf8')
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

  if (userContent) {
    messages.push({ role: 'user', content: userContent })
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

    session.messages.push({ role: 'user', content: userContent })
    session.messages.push({ role: 'assistant', content: full })
  } else {
    if (!options.no_tools) {
      const requestedTags = options.tags ? options.tags.split(',').map(t => t.trim()) : null
      const registry = await createPluginRegistry(toolsDir)
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
      const res = await runWithTools(llm, options.model, messages, tools, policyPlugins)
      console.log(res)

      session.messages.push({ role: 'user', content: userContent })
      session.messages.push({ role: 'assistant', content: res })
    } else {
      const res = await runWithoutTools(llm, options.model, messages)
      console.log(res)

      session.messages.push({ role: 'user', content: userContent })
      session.messages.push({ role: 'assistant', content: res })
    }
  }

  saveHistory(defaultHistoryFile, historyData)
}

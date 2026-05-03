/**
 * Chat command handler for llmctrlx
 *
 * Extended with optional --record <file> support.
 * When --record is set a Recorder captures the inputs, every tool call
 * (via the onToolCall hook threaded into runWithTools), and the final
 * LLM response, then writes a self-contained session JSON file.
 */

import fs from 'fs/promises'
import { loadHistory, saveHistory, getSession }                          from '../core/history.js'
import { buildOptions, isImage, validateFileSize, buildToolPrompt, buildImageMessage } from '../core/utils.js'
import { createPluginRegistry, runWithTools, runWithoutTools }           from '../core/tools.js'
import { Recorder, makeToolCallRecorder }                                from '../core/recorder.js'

// ─── Main command ─────────────────────────────────────────────────────────────

/**
 * Handle chat command
 *
 * @param {Object} llm                - LLM provider instance
 * @param {Object} options            - CLI options (includes options.record)
 * @param {string} defaultHistoryFile - Path to the history JSON file
 * @param {string} toolsDir           - Tools directory
 * @param {number} maxUploadFileSize  - Maximum file attachment size in bytes
 * @param {Object} engineHooks        - Optional engine hook system
 */
export async function cmdChat(llm, options, defaultHistoryFile, toolsDir, maxUploadFileSize,  engineHooks) {
  const recordFile = options.record ?? null

  const historyData = loadHistory(defaultHistoryFile)
  const session     = getSession(historyData, options.session)

  // 1. Prepare Input
  const userContent = await resolveUserContent(options)
  if (!userContent) {
    console.error('Error: No input provided via CLI or stdin.')
    process.exit(1)
  }

  // 2. Build Message Context
  // Capture the history window before building messages so we can snapshot it
  // into recorderInputs — replay needs the exact slice, not just the session name,
  // because live history grows between recording and replay.
  const historyWindow = getHistoryWindow(session, options.history_length)

  const messages = []
  if (options.system) messages.push({ role: 'system', content: options.system })
  messages.push(...historyWindow)
  const fileMessages = await processFiles(options.files, maxUploadFileSize, options.provider)
  messages.push(...fileMessages)
  messages.push({ role: 'user', content: userContent })

  // 3. Build recorder (inputs captured before execution)
  const recorderInputs = {
    model      : options.model,
    parameters : {
      temperature : options.temperature,
      top_p       : options.top_p,
      num_ctx     : options.num_ctx,
    },
    system          : options.system ?? null,
    user            : userContent,
    session         : options.session ?? null,
    history_length  : options.history_length ?? null,
    history_snapshot: historyWindow,   // exact slice injected — makes replay self-contained
    toolsDir        : toolsDir ?? null,
    tags            : options.tags ?? null,
    stream          : options.stream ?? false,
    no_tools        : options.no_tools ?? false,
  }

  const recorder = recordFile ? new Recorder('chat', recorderInputs) : null

  // 4. Execute LLM Request
  const chatOptions = buildOptions(options)

  // Attach the recorder's tool-call hook so every tool invocation is captured
  if (recorder) {
    chatOptions.onToolCall = makeToolCallRecorder(recorder)
    recorder.markLlmStart()
  }

  let assistantResponse = ''

  try {
    if (options.stream) {
      assistantResponse = await handleStreamingChat(llm, options, messages, chatOptions)
    } else {
      assistantResponse = await handleStandardChat(llm, options, messages, chatOptions, toolsDir)
    }

    if (recorder) recorder.markLlmEnd()

    // 5. Post-processing & Persistence
    const filtered = await filterResponse(assistantResponse, engineHooks, options)
    if (!options.stream) console.log(filtered)

    session.messages.push({ role: 'user',      content: userContent })
    session.messages.push({ role: 'assistant', content: filtered })
    saveHistory(defaultHistoryFile, historyData)

    // 6. Save session recording
    if (recorder) {
      recorder.setOutputs({ llmResponse: filtered })
      await recorder.save(recordFile)
      console.error(`[record] session saved → ${recordFile}`)
    }

  } catch (err) {
    if (recorder) {
      recorder.markLlmEnd()
      recorder.setOutputs({ llmResponse: '', error: err.message })
      try {
        await recorder.save(recordFile)
        console.error(`[record] partial session saved → ${recordFile}`)
      } catch {
        // ignore save errors on failure path
      }
    }
    throw err
  }
}

// ─── Private helpers (unchanged from original) ────────────────────────────────

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

function getHistoryWindow(session, historyLengthArg) {
  const length = parseInt(historyLengthArg)
  const limit  = Number.isNaN(length) ? 5 : Math.max(0, length)
  if (!session.messages || session.messages.length === 0 || limit === -1) return []
  return limit === 0 ? session.messages : session.messages.slice(-limit)
}

async function processFiles(filesInput, maxSize, provider = 'ollama') {
  const files = Array.isArray(filesInput) ? filesInput : (filesInput ? [filesInput] : [])
  const msgs  = []

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

async function handleStandardChat(llm, options, messages, chatOptions, toolsDir) {
  if (options.no_tools) {
    return await runWithoutTools(llm, options.model, messages, chatOptions)
  }

  const registry      = await createPluginRegistry(toolsDir, options.session)
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

async function handleStreamingChat(llm, options, messages, chatOptions) {
  // Strip recorder-specific keys before forwarding to provider
  const { onToolCall, ...providerOptions } = chatOptions

  if(onToolCall) {
    providerOptions.onToolCall = onToolCall
  }
  const stream = await llm.chat({
    model    : options.model,
    messages,
    stream   : true,
    options  : providerOptions,
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

async function filterResponse(content, engineHooks, options) {
  if (typeof engineHooks?.filterResponse !== 'function') return content

  const result = await engineHooks.filterResponse('chat', {
    content,
    filtered    : false,
    requestMeta : { flags: options },
  })

  return result.content
}
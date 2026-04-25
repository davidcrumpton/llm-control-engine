/**
 * Tool execution and management for llmctrlx
 * Handles tool loading, validation, and execution flow
 */

import path from 'path'
import { readdirSync } from 'node:fs'
import { extractJSON, validateArgs, validateTool } from './utils.js'

/**
 * Execute a tool with given arguments
 * @param {Object} tool - Tool object to execute
 * @param {Object} args - Arguments for the tool
 * @returns {Promise<string>} - Tool output as string
 */
export async function executeTool(tool, args) {
  try {
    const result = await tool.run(args)

    if (typeof result !== 'string') {
      return JSON.stringify(result)
    }

    return result
  } catch (err) {
    return `Tool '${tool.name}' failed: ${err.message}`
  }
}

/**
 * Run LLM chat without tools
 * @param {Object} llm - LLM provider instance
 * @param {string} model - Model name to use
 * @param {Array} messages - Message history
 * @returns {Promise<string>} - LLM response
 */
export async function runWithoutTools(llm, model, messages) {
  // should inject a system prompt that tells the model to tell the user that tools are not available
  const systemPrompt = 'You do not have access to any tools. Notify user that tools are not available. If user asks'
  messages.unshift({ role: 'system', content: systemPrompt })
  const res = await llm.chat({ model, messages })
  return res.message.content
}

/**
 * Run LLM chat with tool support - handles tool loop until final response
 * @param {Object} llm - LLM provider instance
 * @param {string} model - Model name to use
 * @param {Array} messages - Message history
 * @param {Array} tools - Available tools
 * @returns {Promise<string>} - Final LLM response after tool execution
 */
export async function runWithTools(llm, model, messages, tools) {
  const toolHistory = []
  let loopCount = 0
  const MAX_LOOPS = 15

  while (true) {
    const res = await llm.chat({ model, messages })

    const content = res.message.content

    try {
      const parsed = extractJSON(content)

      if (parsed && parsed.tool) {
        const tool = tools.find(t => t.name === parsed.tool)

        if (!tool) {
          messages.push({
            role: 'assistant',
            content: `Tool ${parsed.tool} not found`
          })
          continue
        }

        try {
          validateArgs(tool, parsed.arguments || {})
        } catch (err) {
          messages.push({
            role: 'assistant',
            content: `Error: ${err.message}`
          })
          continue
        }

        const argsStr = JSON.stringify(parsed.arguments || {})

        loopCount++
        if (loopCount > MAX_LOOPS) {
          messages.push({
            role: 'user',
            content: `System Error: Maximum tool loop limit reached (${MAX_LOOPS}). Please provide your final answer to the user.`
          })
          continue
        }

        const isDuplicate = toolHistory.some(h => h.name === parsed.tool && h.argsStr === argsStr)
        if (isDuplicate) {
          messages.push({
            role: 'user',
            content: `System Error: You already called '${parsed.tool}' with these exact arguments. Do not repeat identical tool calls. Try a different approach or provide your final answer.`
          })
          continue
        }

        const toolPolicies = tool.policies || {}

        if (toolPolicies.requires) {
          const missing = toolPolicies.requires.find(req => !toolHistory.some(h => h.name === req))
          if (missing) {
            messages.push({
              role: 'user',
              content: `System Error: Policy violation. You must use the '${missing}' tool before using '${tool.name}'.`
            })
            continue
          }
        }

        if (toolPolicies.maxCalls) {
          const callCount = toolHistory.filter(h => h.name === parsed.tool).length
          if (callCount >= toolPolicies.maxCalls) {
            messages.push({
              role: 'user',
              content: `System Error: Policy violation. You have reached the maximum allowed calls (${toolPolicies.maxCalls}) for '${tool.name}'.`
            })
            continue
          }
        }

        const result = await executeTool(tool, parsed.arguments || {})

        toolHistory.push({ name: parsed.tool, argsStr })

        messages.push({
          role: 'assistant',
          content
        })

        messages.push({
          role: 'user',
          content: `Tool '${tool.name}' output:\n${result}`
        })

        continue
      }
    } catch {
      // not JSON → normal response
    }

    return content
  }
}

/**
 * Load tools from a directory
 * @param {string} toolsDir - Directory containing tool files
 * @param {Array<string>|null} requestedTags - Optional tags to filter tools
 * @returns {Promise<Array>} - Array of loaded and validated tools
 */
export async function loadTools(toolsDir, requestedTags = null) {
  const files = readdirSync(toolsDir).filter(f => f.endsWith('.js'))

  const toolMap = new Map()

  for (const file of files) {
    const fullPath = path.resolve(toolsDir, file)

    try {
      const mod = await import(fullPath)
      const tool = validateTool(mod.default, fullPath)

      if (requestedTags) {
        const toolTags = tool.tags || []
        const hasAlways = toolTags.includes('always')
        const hasMatch = requestedTags.some(tag => toolTags.includes(tag))
        if (!hasAlways && !hasMatch) {
          continue
        }
      }

      // last one wins (allows overrides)
      toolMap.set(tool.name, tool)

    } catch (err) {
      console.error(`Skipping tool: ${file}`)
      console.error(`  → ${err.message}`)
    }
  }

  return Array.from(toolMap.values())
}

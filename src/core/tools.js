/**
 * Tool execution and management for llmctrlx
 * Handles tool loading, validation, and execution flow
 */

import path from 'path'
import os from 'os'
import { fileURLToPath } from 'url'
import { extractJSON, validateArgs } from './utils.js'
import { Registry } from './registry.js'
import { loadPluginsFromDir } from './loader.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BUILTIN_PLUGINS_DIR = path.resolve(__dirname, '../plugins')
const GLOBAL_PLUGINS_DIR = path.resolve(os.homedir(), '.llmctrlx/plugins')

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

function getMessageText(res) {
  const visible = res?.message?.content ?? ''
  const thinking = res?.message?.thinking ?? ''
  return visible || thinking || ''
}

/**
 * Run LLM chat without tools
 * @param {Object} llm - LLM provider instance
 * @param {string} model - Model name to use
 * @param {Array} messages - Message history
 * @returns {Promise<string>} - LLM response
 */
export async function runWithoutTools(llm, model, messages, chatOptions = {}) {
  const systemPrompt = 'You do not have access to any tools. Notify user that tools are not available. If user asks'
  messages.unshift({ role: 'system', content: systemPrompt })
  const res = await llm.chat({ model, messages, options: chatOptions })
  return getMessageText(res)
}

async function applyPolicyPlugins(tool, args, policies = [], ctx = {}) {
  for (const policy of policies) {
    if (typeof policy.onBeforeToolRun !== 'function') {
      continue
    }

    const result = await policy.onBeforeToolRun({ tool, args, ctx })
    if (result && result.allow === false) {
      return result
    }
  }

  return null
}

/**
 * Run LLM chat with tool support - handles tool loop until final response
 * @param {Object} llm - LLM provider instance
 * @param {string} model - Model name to use
 * @param {Array} messages - Message history
 * @param {Array} tools - Available tools
 * @param {Array} policies - Available policy plugins
 * @returns {Promise<string>} - Final LLM response after tool execution
 */
export async function runWithTools(llm, model, messages, tools, policies = [], chatOptions = {}) {
  const toolHistory = []
  let loopCount = 0
  const MAX_LOOPS = 15

  while (true) {
    const res = await llm.chat({ model, messages, options: chatOptions })
    const content = getMessageText(res)

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

        const policyResult = await applyPolicyPlugins(tool, parsed.arguments || {}, policies, {
          tools,
          messages,
          model
        })

        if (policyResult) {
          messages.push({
            role: 'assistant',
            content: `System Error: Policy violation. ${policyResult.message}`
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
 * Create a plugin registry and load plugins from built-in, project, legacy, and global locations.
 * @param {string} toolsDir - Primary tools directory or legacy tools path
 * @returns {Promise<Registry>} - Plugin registry with loaded tools and policies
 */
export async function createPluginRegistry(toolsDir) {
  const registry = new Registry()
  const ctx = { toolsDir, projectDir: process.cwd() }

  await loadPluginsFromDir(BUILTIN_PLUGINS_DIR, registry, ctx)
  // Removed PROJECT_PLUGINS_DIR to prevent loading dev plugins
  if (toolsDir) {
    await loadPluginsFromDir(toolsDir, registry, ctx)
  }
  await loadPluginsFromDir(GLOBAL_PLUGINS_DIR, registry, ctx)

  return registry
}

/**
 * Load tools from a directory using the plugin registry.
 * @param {string} toolsDir - Directory containing tool files / plugin folders
 * @param {Array<string>|null} requestedTags - Optional tags to filter tools
 * @returns {Promise<Array>} - Array of loaded tool plugins
 */
export async function loadTools(toolsDir, requestedTags = null) {
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

  return tools
}

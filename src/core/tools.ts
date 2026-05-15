/**
 * Tool execution and management for llmctrlx
 * Handles tool loading, validation, and execution flow with LLM provider integration
 */

import { extractJSON, validateArgs } from './utils.js'
import { Registry } from './registry.js'
import { loadPluginsFromDir } from './loader.ts'
import {
  LLMProvider,
  LLMResponse,
  LLMMessage,
  ToolPlugin,
  PolicyPlugin,
  PolicyResult,
  PolicyContext,
} from '../types.js'

/**
 * Execute a tool with given arguments, returning output as a string.
 */
export async function executeTool(
  tool: ToolPlugin,
  args: Record<string, unknown>
): Promise<string> {
  try {
    const result = await tool.run(args)

    if (typeof result !== 'string') {
      return JSON.stringify(result)
    }

    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return `Tool '${tool.name}' failed: ${message}`
  }
}

/**
 * Extract displayable text from an LLM response, prioritizing content over thinking.
 */
function getMessageText(res: LLMResponse): string {
  const visible = res?.message?.content ?? ''
  const thinking = res?.message?.thinking ?? ''
  return visible || thinking || ''
}

/**
 * Run LLM chat without tools, informing the user that tools are unavailable.
 */
export async function runWithoutTools(
  llm: LLMProvider,
  model: string,
  messages: LLMMessage[],
  chatOptions: Record<string, unknown> = {}
): Promise<string> {
  const systemPrompt =
    'You do not have access to any tools. Notify user that tools are not available. If user asks'
  messages.unshift({ role: 'system', content: systemPrompt })
  const res = await llm.chat({ model, messages, options: chatOptions })
  return getMessageText(res)
}

async function applyPolicyPlugins(
  tool: ToolPlugin,
  args: Record<string, unknown>,
  policies: PolicyPlugin[] = [],
  ctx: Partial<PolicyContext> = {}
): Promise<PolicyResult | null> {
  for (const policy of policies) {
    if (typeof policy.onBeforeToolRun !== 'function') {
      continue
    }

    const result = await policy.onBeforeToolRun({
      tool,
      args,
      ...ctx,
    } as PolicyContext)
    if (result && result.allow === false) {
      return result
    }
  }

  return null
}

interface ToolHistory {
  name: string
  argsStr: string
}

interface ParsedToolCall {
  tool?: string
  arguments?: Record<string, unknown>
}

/**
 * Run LLM chat with full tool support, handling the tool loop until reaching a final response.
 *
 * Manages:
 * - Tool call extraction and execution
 * - Policy validation before each tool call
 * - Duplicate call prevention
 * - Tool ordering constraints (requires, maxCalls)
 * - Loop protection (max 15 iterations)
 * - Optional recording via onToolCall callback
 */
export async function runWithTools(
  llm: LLMProvider,
  model: string,
  messages: LLMMessage[],
  tools: ToolPlugin[],
  policies: PolicyPlugin[] = [],
  chatOptions: Record<string, unknown> = {}
): Promise<string> {
  // Extract the recorder callback before forwarding chatOptions to llm.chat()
  // so the provider never sees an unrecognised key.
  const { onToolCall, ...llmChatOptions } = chatOptions as any

  const toolHistory: ToolHistory[] = []
  let loopCount = 0
  const MAX_LOOPS = 15

  while (true) {
    const res = await llm.chat({
      model,
      messages,
      options: llmChatOptions,
    })
    const content = getMessageText(res)

    try {
      const parsed = extractJSON(res.message?.content || '') as ParsedToolCall | null
      if (parsed && parsed.tool) {
        const tool = tools.find((t) => t.name === parsed.tool)

        if (!tool) {
          messages.push({
            role: 'assistant',
            content: `Tool ${parsed.tool} not found`,
          })
          continue
        }

        try {
          validateArgs(tool, parsed.arguments || {})
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          messages.push({
            role: 'assistant',
            content: `Error: ${message}`,
          })
          continue
        }

        const policyResult = await applyPolicyPlugins(
          tool,
          parsed.arguments || {},
          policies,
          {
            tool,
            args: parsed.arguments || {},
            tools,
            messages,
            model,
          } as any
        )

        if (policyResult) {
          messages.push({
            role: 'assistant',
            content: `System Error: Policy violation. ${policyResult.message}`,
          })
          continue
        }

        const argsStr = JSON.stringify(parsed.arguments || {})

        loopCount++
        if (loopCount > MAX_LOOPS) {
          messages.push({
            role: 'user',
            content: `System Error: Maximum tool loop limit reached (${MAX_LOOPS}). Please provide your final answer to the user.`,
          })
          continue
        }

        const isDuplicate = toolHistory.some(
          (h) => h.name === parsed.tool && h.argsStr === argsStr
        )
        if (isDuplicate) {
          messages.push({
            role: 'user',
            content: `System Error: You already called '${parsed.tool}' with these exact arguments. Do not repeat identical tool calls. Try a different approach or provide your final answer.`,
          })
          continue
        }

        const toolPolicies = tool.policies || {}

        if (toolPolicies.requires) {
          const missing = toolPolicies.requires.find(
            (req) => !toolHistory.some((h) => h.name === req)
          )
          if (missing) {
            messages.push({
              role: 'user',
              content: `System Error: Policy violation. You must use the '${missing}' tool before using '${tool.name}'.`,
            })
            continue
          }
        }

        if (toolPolicies.maxCalls) {
          const callCount = toolHistory.filter(
            (h) => h.name === parsed.tool
          ).length
          if (callCount >= (toolPolicies.maxCalls as number)) {
            messages.push({
              role: 'user',
              content: `System Error: Policy violation. You have reached the maximum allowed calls (${toolPolicies.maxCalls}) for '${tool.name}'.`,
            })
            continue
          }
        }

        // ── Execute tool ────────────────────────────────────────────────────
        const result = await executeTool(tool, parsed.arguments || {})

        // ── Notify recorder (if any) ────────────────────────────────────────
        if (typeof onToolCall === 'function') {
          onToolCall(parsed.tool, parsed.arguments || {}, result)
        }

        toolHistory.push({ name: parsed.tool, argsStr })

        messages.push({ role: 'assistant', content })
        messages.push({
          role: 'user',
          content: `Tool '${tool.name}' output:\n${result}`,
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
 */
export async function createPluginRegistry(
  toolsDir: string | undefined,
  session?: string
): Promise<Registry> {
  const registry = new Registry()
  const ctx: Record<string, unknown> = {
    toolsDir,
    projectDir: process.cwd(),
    session,
  }

  if (toolsDir) {
    await loadPluginsFromDir(toolsDir, registry, ctx)
  }

  return registry
}

/**
 * Load tools from a directory using the plugin registry, optionally filtering by tags.
 */
export async function loadTools(
  toolsDir: string | undefined,
  requestedTags: string[] | null = null
): Promise<ToolPlugin[]> {
  const registry = await createPluginRegistry(toolsDir)
  let tools = registry.list('tool')

  if (requestedTags) {
    tools = tools.filter((tool) => {
      const toolTags = tool.tags || []
      const hasAlways = toolTags.includes('always')
      const hasMatch = requestedTags.some((tag) => toolTags.includes(tag))
      return hasAlways || hasMatch
    })
  }

  return tools
}

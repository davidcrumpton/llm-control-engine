/**
 * Core utility functions for llmctrlx
 * Pure functions without external dependencies
 */

import fs from 'fs'
import path from 'path'

/**
 * Build options object for LLM chat requests
 * @param {Object} opts - Options object with optional json, temperature, top_p
 * @returns {Object} - Filtered options for API call
 */
export function buildOptions(opts) {
  const out = {}
  if (opts.json) out.json = true
  if (opts.temperature) out.temperature = opts.temperature
  if (opts.top_p) out.top_p = opts.top_p
  return out
}

/**
 * Validate that a file doesn't exceed maximum upload size
 * @param {string} file - File path
 * @param {number} maxSize - Maximum allowed size in bytes
 * @throws {Error} - If file size exceeds maximum
 */
export function validateFileSize(file, maxSize) {
  const stats = fs.statSync(file)
  if (stats.size > maxSize) {
    throw new Error('File size exceeds the maximum upload file size')
  }
}

/**
 * Check if a file is an image
 * @param {string} file - File path
 * @returns {boolean} - True if file is an image
 */
export function isImage(file) {
  return ['.png', '.jpg', '.jpeg', '.webp']
    .includes(path.extname(file).toLowerCase())
}

/**
 * Extract JSON from text, handling markdown code blocks and malformed JSON
 * @param {string} text - Text to extract JSON from
 * @returns {Object|null} - Parsed JSON object or null
 */
export function extractJSON(text) {
  // First try to find a markdown json block
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/)
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1])
    } catch {
      // fall through
    }
  }

  // Try to find the first valid JSON object by balancing braces
  let firstBrace = text.indexOf('{')
  if (firstBrace === -1) return null

  let str = text.slice(firstBrace)
  let depth = 0
  let lastBrace = -1

  for (let i = 0; i < str.length; i++) {
    if (str[i] === '{') depth++
    else if (str[i] === '}') {
      depth--
      if (depth === 0) {
        lastBrace = i
        break
      }
    }
  }

  if (lastBrace !== -1) {
    try {
      return JSON.parse(str.slice(0, lastBrace + 1))
    } catch {
      return null
    }
  }

  return null
}

/**
 * Validate that tool arguments satisfy the tool's parameter schema
 * @param {Object} tool - Tool object with parameters schema
 * @param {Object} args - Arguments to validate
 * @throws {Error} - If required arguments are missing
 */
export function validateArgs(tool, args) {
  const schema = tool.parameters

  // Handle both flat schema and standard JSON schema with 'properties'
  const properties = schema.properties || schema
  const requiredList = Array.isArray(schema.required) ? schema.required : []

  for (const key in properties) {
    const isRequired = properties[key].required || requiredList.includes(key)
    if (isRequired && !(key in args)) {
      throw new Error(`Missing required param: ${key}`)
    }
  }
}

/**
 * Validate that a tool object has all required fields
 * @param {Object} tool - Tool object to validate
 * @param {string} source - Source file path (for error messages)
 * @returns {Object} - The validated tool object
 * @throws {Error} - If tool is invalid
 */
export function validateTool(tool, source) {
  if (!tool || typeof tool !== 'object') {
    throw new Error(`Invalid tool export from ${source}`)
  }

  if (!tool.name || typeof tool.name !== 'string') {
    throw new Error(`Tool missing valid 'name' in ${source}`)
  }

  if (!tool.description || typeof tool.description !== 'string') {
    throw new Error(`Tool '${tool.name}' missing 'description'`)
  }

  if (!tool.parameters || typeof tool.parameters !== 'object') {
    throw new Error(`Tool '${tool.name}' missing 'parameters'`)
  }

  if (typeof tool.run !== 'function') {
    throw new Error(`Tool '${tool.name}' missing 'run()'`)
  }

  // Support version number matching regex /^v?[0-9]+\.[0-9]+\.[0-9]+$/
  if (tool.version) {
    if (typeof tool.version !== 'string') {
      throw new Error(`Tool '${tool.name}' version must be a string`)
    }

    if (!/^v?[0-9]+\.[0-9]+\.[0-9]+$/.test(tool.version)) {
      throw new Error(`Tool '${tool.name}' version must match regex /^v?[0-9]+\.[0-9]+\.[0-9]+$/`)
    }
  } else {
    throw new Error(`Tool '${tool.name}' missing version`)
  }

  if (tool.tags !== undefined) {
    if (!Array.isArray(tool.tags) || !tool.tags.every(t => typeof t === 'string')) {
      throw new Error(`Tool '${tool.name}' tags must be an array of strings`)
    }
  }

  if (tool.policies !== undefined) {
    if (typeof tool.policies !== 'object' || Array.isArray(tool.policies)) {
      throw new Error(`Tool '${tool.name}' policies must be an object`)
    }
    if (tool.policies.requires && !Array.isArray(tool.policies.requires)) {
      throw new Error(`Tool '${tool.name}' policies.requires must be an array`)
    }
  }

  return tool
}

/**
 * Build the system prompt that instructs the model on tool usage
 * @param {Array} tools - Array of available tools
 * @returns {string} - System prompt for tool usage
 */
export function buildToolPrompt(tools) {
  return `
You MUST respond with ONLY valid JSON when calling a tool.
Do not include any explanation, text, or markdown.

Tool usage strategy:
1. Do not repeat identical tool calls with the same arguments.
2. If a tool fails or returns no useful information, try a different approach or tool.
3. For system command research: use \`apropos\` to discover commands, \`whatis\` to confirm purpose, and \`man\` only for deeper details.

If no tool is needed, respond normally.

Tool call format:
{
  "tool": "tool_name",
  "arguments": { ... }
}

Available tools:
${tools.map(t => `
- ${t.name}: ${t.description}
  parameters: ${JSON.stringify(t.parameters)}
`).join('\n')}
`
}

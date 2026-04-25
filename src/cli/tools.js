/**
 * Tools command handler for llmctrlx
 */

import { loadTools } from '../core/tools.js'

/**
 * Handle tools command
 * @param {Object} options - CLI options
 * @param {string} toolsDir - Tools directory path
 */
export async function cmdTools(options, toolsDir) {
  const requestedTags = options.tags ? options.tags.split(',').map(t => t.trim()) : null
  const tools = await loadTools(toolsDir, requestedTags)

  if (options.json) {
    console.log(JSON.stringify(tools, null, 2))
    return
  }

  for (const tool of tools) {
    console.log(`\n${tool.name}`)
    console.log(`  ${tool.description}`)

    if (tool.tags) {
      console.log(`  tags: ${JSON.stringify(tool.tags)}`)
    }

    if (tool.parameters && Object.keys(tool.parameters).length) {
      console.log(`  params:`)
      for (const [key, val] of Object.entries(tool.parameters)) {
        console.log(`    - ${key}: ${JSON.stringify(val)}`)
      }
    }
  }
}

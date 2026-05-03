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
  const requestedTags = options.tags?.split(',').map(t => t.trim()) ?? null
  const tools = await loadTools(toolsDir, requestedTags)

  // 1. Handle Empty State
  if (tools.length === 0) {
    console.warn('No tools found.')
    return
  }

  // 2. High-Priority Output (JSON)
  if (options.json) {
    console.log(JSON.stringify(tools, null, 2))
    return
  }

  // 3. Specific Tool Detail
  if (options.show) {
    const tool = tools.find(t => t.name === options.show)
    if (!tool) {
      console.error(`Error: Tool "${options.show}" not found.`)
      process.exitCode = 1
      return
    }
    console.log(JSON.stringify(tool, null, 2))
    return
  }

  // 4. List Summary
  if (options.list) {
    tools.forEach(tool => console.log(`- ${tool.name}`))
    return
  }

  // 5. Default Help Message
  console.log('Usage: tools [options]')
  console.log('Options: --list, --show <tool_name>, --json, --tags <tag1,tag2>')
}

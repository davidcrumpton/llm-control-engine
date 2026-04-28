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

  if (tools.length === 0) {
    console.log('No tools found')
    return
  }    
  
  if(options.json) {
    console.log(JSON.stringify(tools, null, 2))
    return
  }

  if (options.list) {
    if (tools.length === 0) {
      console.log('No tools found')
      return
    }
    tools.forEach(tool => console.log(tool.name))
    return
  }

  if (options.show) {
    const tool = tools.find(t => t.name === options.show)
    if (!tool) {
      console.error(`Tool not found: ${options.show}`)
      return
    }
    console.log(JSON.stringify(tool, null, 2))
    return
  }

  if (options.json) {
    console.log(JSON.stringify(tools, null, 2))
    return
  }

  console.log('tools commands: --list, --show <tool>, --json')
}

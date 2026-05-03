/**
 * Plugins command handler for llmctrlx
 */

import { existsSync } from 'fs'
import { readdir, readFile } from 'fs/promises'
import path from 'path'

const PLUGIN_EXT_REGEX = /\.plugin\.(ts|js)$/

/**
 * Discover plugin files in a directory
 */
async function discoverPlugins(pluginsDir) {
  if (!existsSync(pluginsDir)) return []

  try {
    const entries = await readdir(pluginsDir, { withFileTypes: true })
    
    const pluginPromises = entries.map(async (entry) => {
      const fullPath = path.join(pluginsDir, entry.name)

      if (entry.isDirectory()) {
        const files = await readdir(fullPath)
        return files
          .filter(f => PLUGIN_EXT_REGEX.test(f))
          .map(file => ({
            name: entry.name,
            file,
            path: path.join(fullPath, file),
            type: 'hook-plugin'
          }))
      } 

      if (PLUGIN_EXT_REGEX.test(entry.name)) {
        return [{
          name: entry.name.replace(PLUGIN_EXT_REGEX, ''),
          file: entry.name,
          path: fullPath,
          type: 'hook-plugin'
        }]
      }

      return []
    })

    const results = await Promise.all(pluginPromises)
    return results.flat()
  } catch (err) {
    console.error(` Error discovering plugins: ${err.message}`)
    return []
  }
}

/**
 * Read plugin metadata with improved regex
 */
async function readPluginMetadata(filePath) {
  try {
    const content = await readFile(filePath, 'utf-8')
    
    // Improved description match: looks for JSDoc or standard comments
    const descMatch = content.match(/\/\*\*?[\s\S]*?\*\s*(.+?)(?:\n|\*\/)/)
    const versionMatch = content.match(/version[:\s]+['"`]([^'"`\s]+)['"`]/i)

    return {
      description: descMatch ? descMatch[1].trim() : 'No description',
      version: versionMatch ? versionMatch[1] : 'unknown'
    }
  } catch {
    return { description: 'No description', version: 'unknown' }
  }
}

/**
 * Handle plugins command
 */
export async function cmdPlugins(options, pluginsDir) {
  const plugins = await discoverPlugins(pluginsDir)

  if (plugins.length === 0) {
    console.log('No plugins found.')
    return
  }

  // Enrich plugins with metadata in parallel
  const enrichedPlugins = await Promise.all(
    plugins.map(async (p) => ({ ...p, ...(await readPluginMetadata(p.path)) }))
  )

  if (options.json) {
    console.log(JSON.stringify(enrichedPlugins, null, 2))
    return
  }

  // Filter if a specific plugin is requested via --show <name>
  const showName = typeof options.show === 'string' ? options.show : null
  const toDisplay = showName 
    ? enrichedPlugins.filter(p => p.name === showName) 
    : enrichedPlugins

  if (showName && toDisplay.length === 0) {
    console.log(`Plugin '${showName}' not found.`)
    return
  }

  displayPlugins(toDisplay, !!options.show)
}

/**
 * Clean UI Output
 */
function displayPlugins(plugins, verbose = false) {
  if (!verbose) {
    console.log(`\nFound ${plugins.length} plugin(s):`)
    plugins.forEach(p => {
      console.log(`  - ${p.name.padEnd(15)} [${p.version}] (${p.type}) — ${p.description}`)
    })
  } else {
    plugins.forEach(p => {
      console.log(`\nPlugin: ${p.name}`)
      console.log(`  File:    ${p.file}`)
      console.log(`  Path:    ${p.path}`)
      console.log(`  Type:    ${p.type}`)
      console.log(`  Version: ${p.version}`)
      console.log(`  Desc:    ${p.description}`)
    })
  }
}
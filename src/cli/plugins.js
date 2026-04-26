/**
 * Plugins command handler for llmctrlx
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

/**
 * Discover plugin files in a directory
 * @param {string} pluginsDir - Plugins directory path
 * @returns {Promise<Array>} Array of plugin info objects
 */
async function discoverPlugins(pluginsDir) {
  const plugins = []

  if (!fs.existsSync(pluginsDir)) {
    return plugins
  }

  try {
    const entries = fs.readdirSync(pluginsDir, { withFileTypes: true })

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Look for plugin files in subdirectories
        const subDir = path.join(pluginsDir, entry.name)
        const files = fs.readdirSync(subDir)
        const pluginFiles = files.filter(f => f.endsWith('.plugin.ts') || f.endsWith('.plugin.js'))

        for (const file of pluginFiles) {
          const filePath = path.join(subDir, file)
          plugins.push({
            name: entry.name,
            file: file,
            path: filePath,
            type: 'hook-plugin'
          })
        }
      } else if (entry.name.endsWith('.plugin.ts') || entry.name.endsWith('.plugin.js')) {
        // Root level plugin files
        const filePath = path.join(pluginsDir, entry.name)
        const name = entry.name.replace(/\.plugin\.(ts|js)$/, '')
        plugins.push({
          name: name,
          file: entry.name,
          path: filePath,
          type: 'hook-plugin'
        })
      }
    }
  } catch (err) {
    console.error(`Error discovering plugins: ${err.message}`)
  }

  return plugins
}

/**
 * Read plugin metadata from a file
 * @param {string} filePath - Path to plugin file
 * @returns {Promise<Object|null>} Plugin metadata or null if cannot read
 */
async function readPluginMetadata(filePath) {
  try {
    // Try to read the file and extract metadata from comments or code
    const content = fs.readFileSync(filePath, 'utf-8')
    
    // Extract description from JSDoc or first comment
    const descMatch = content.match(/\/\*\*\s*\n\s*\*\s*(.+?)\s*\n/)
    const description = descMatch ? descMatch[1] : 'No description'

    // Try to extract version from package or code
    const versionMatch = content.match(/version['":\s]+['"]?([^'";\s]+)['"]?/)
    const version = versionMatch ? versionMatch[1] : 'unknown'

    return {
      description,
      version
    }
  } catch (err) {
    return null
  }
}

/**
 * Handle plugins command
 * @param {Object} options - CLI options
 * @param {string} pluginsDir - Plugins directory path
 */
export async function cmdPlugins(options, pluginsDir) {
  const plugins = await discoverPlugins(pluginsDir)

  if (options.json) {
    console.log(JSON.stringify(plugins, null, 2))
    return
  }

  if (!plugins.length) {
    console.log('No plugins found')
    return
  }

  if (options.list || !options.show) {
    // List mode (default)
    console.log(`\nFound ${plugins.length} plugin(s):\n`)
    for (const plugin of plugins) {
      console.log(`  - ${plugin.name}`)
      console.log(`    File: ${plugin.file}`)
      console.log(`    Type: ${plugin.type}`)
    }
  }

  if (options.show) {
    // Show detailed mode
    const showName = options.show === true ? null : options.show
    const toShow = showName ? plugins.filter(p => p.name === showName) : plugins

    if (!toShow.length && showName) {
      console.log(`Plugin '${showName}' not found`)
      return
    }

    for (const plugin of toShow) {
      console.log(`\n${plugin.name}`)
      console.log(`  File: ${plugin.file}`)
      console.log(`  Path: ${plugin.path}`)
      console.log(`  Type: ${plugin.type}`)

      // Try to read metadata
      const metadata = await readPluginMetadata(plugin.path)
      if (metadata) {
        console.log(`  Version: ${metadata.version}`)
        console.log(`  Description: ${metadata.description}`)
      }
    }
  }
}

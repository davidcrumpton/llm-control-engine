/**
 * Plugin loader for llmctrlx
 */

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { validateTool } from './utils.js'

const JS_EXTENSIONS = ['.js', '.mjs', '.cjs']

function isPluginFile(filePath) {
  return JS_EXTENSIONS.includes(path.extname(filePath))
}

async function importPlugin(filePath) {
  const mod = await import(pathToFileURL(filePath).href)
  return mod.default || mod
}

function normalizePlugin(plugin) {
  if (!plugin || typeof plugin !== 'object') {
    return null
  }

  const normalized = { ...plugin }
  const runner = normalized.run || normalized.handler || normalized.execute

  if (!normalized.type && typeof runner === 'function') {
    normalized.type = 'tool'
  }

  if (normalized.type === 'tool' && typeof runner === 'function') {
    normalized.run = runner
  }

  return normalized
}

async function loadPluginFile(filePath, registry, ctx) {
  try {
    const plugin = normalizePlugin(await importPlugin(filePath))
    if (!plugin) {
      return
    }

    plugin.init?.(ctx)

    if (plugin.type === 'tool') {
      validateTool(plugin, filePath)
    }

    registry.register(plugin)
  } catch (err) {
    console.error(`Skipping plugin file ${filePath}: ${err.message}`)
  }
}

export async function loadPluginsFromDir(dir, registry, ctx) {
  if (!dir || !fs.existsSync(dir)) {
    return
  }

  const entries = fs.readdirSync(dir)
  for (const entry of entries) {
    const fullPath = path.resolve(dir, entry)
    const stat = fs.statSync(fullPath)

    if (stat.isDirectory()) {
      await loadPluginsFromDir(fullPath, registry, ctx)
      continue
    }

    if (!stat.isFile() || !isPluginFile(fullPath)) {
      continue
    }

    await loadPluginFile(fullPath, registry, ctx)
  }
}

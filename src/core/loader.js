/**
 * Plugin loader for llmctrlx
 *
 * Security hardening:
 *   - Added assertConfined() to verify every resolved file path sits strictly
 *     inside the declared scan root, blocking path-traversal and symlink-escape
 *     attacks (e.g., a plugin directory entry that resolves to ../../etc).
 *   - Stat result is checked after path resolution so symlinks that point
 *     outside the root are caught before any I/O.
 */

import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { validateTool } from './utils.js'

const JS_EXTENSIONS = ['.js', '.mjs', '.cjs']

// ---------------------------------------------------------------------------
// Path-confinement helper
// ---------------------------------------------------------------------------

/**
 * Assert that `target` resolves to a path strictly inside `root`.
 * Both are resolved to their canonical absolute forms before comparison,
 * so symlinks and `..` components cannot escape.
 *
 * @param {string} root   - Trusted base directory (need not end with '/').
 * @param {string} target - Path to validate.
 * @throws {Error} if target lies outside root.
 */
function assertConfined(root, target) {
  const resolvedRoot   = path.resolve(root)
  const resolvedTarget = path.resolve(target)

  // Use a trailing separator so '/safe-dir-extra' doesn't match '/safe-dir'.
  if (!resolvedTarget.startsWith(resolvedRoot + path.sep) &&
      resolvedTarget !== resolvedRoot) {
    throw new Error(
      `Path traversal detected: '${target}' is outside the allowed root '${root}'.`
    )
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isPluginFile(filePath) {
  return JS_EXTENSIONS.includes(path.extname(filePath))
}

async function importPlugin(filePath) {
  const mod = await import(pathToFileURL(filePath).href)
  return mod.default || mod
}

function normalizePlugin(plugin) {
  if (!plugin || typeof plugin !== 'object') return null

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
    if (!plugin) return

    plugin.init?.(ctx)

    if (plugin.type === 'tool') {
      validateTool(plugin, filePath)
    }

    registry.register(plugin)
  } catch (err) {
    console.error(`Skipping plugin file ${filePath}: ${err.message}`)
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Recursively load all plugin files from `dir`, confining every resolved
 * path inside `dir` to prevent traversal attacks.
 *
 * @param {string}   dir      - Directory to scan.
 * @param {Registry} registry - Plugin registry to populate.
 * @param {Object}   ctx      - Loader context passed to plugin init().
 */
export async function loadPluginsFromDir(dir, registry, ctx) {
  if (!dir || !fs.existsSync(dir)) return

  // Resolve the root once so all child checks use the same canonical base.
  const root = path.resolve(dir)

  const entries = fs.readdirSync(root)

  for (const entry of entries) {
    const fullPath = path.resolve(root, entry)

    // ── Confinement check ──────────────────────────────────────────────────
    // Reject symlinks or `..` components that escape the scan root.
    try {
      assertConfined(root, fullPath)
    } catch (err) {
      console.error(`Skipping '${entry}': ${err.message}`)
      continue
    }

    // Stat after confinement so we don't follow a symlink that was just
    // validated by name but points elsewhere.
    let stat
    try {
      // lstatSync — does NOT follow symlinks; reveals the link itself.
      stat = fs.lstatSync(fullPath)
    } catch {
      continue
    }

    if (stat.isSymbolicLink()) {
      // Resolve the symlink target and re-assert confinement.
      let realPath
      try {
        realPath = fs.realpathSync(fullPath)
        assertConfined(root, realPath)
      } catch (err) {
        console.error(`Skipping symlink '${entry}': ${err.message}`)
        continue
      }
      // The symlink target is safe; update stat to the real file.
      stat = fs.statSync(realPath)
    }

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

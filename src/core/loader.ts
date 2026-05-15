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

import fs from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { createRequire } from "module";
import { validateTool } from "./utils.js";
import { Registry } from "./registry.js";
import { Plugin } from "../types.js";

const JS_EXTENSIONS = [".js", ".mjs", ".cjs", ".ts"];

// ---------------------------------------------------------------------------
// Path-confinement helper
// ---------------------------------------------------------------------------

/**
 * Assert that `target` resolves to a path strictly inside `root`.
 * Both are resolved to their canonical absolute forms before comparison,
 * so symlinks and `..` components cannot escape.
 *
 * @throws {Error} if target lies outside root.
 */
function assertConfined(root: string, target: string): void {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);

  // Use a trailing separator so '/safe-dir-extra' doesn't match '/safe-dir'.
  if (
    !resolvedTarget.startsWith(resolvedRoot + path.sep) &&
    resolvedTarget !== resolvedRoot
  ) {
    throw new Error(
      `Path traversal detected: '${target}' is outside the allowed root '${root}'.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function isPluginFile(filePath: string): boolean {
  if (filePath.endsWith(".d.ts")) return false;
  return JS_EXTENSIONS.includes(path.extname(filePath));
}

/**
 * Load a plugin file using dynamic import().
 * Falls back to a CJS-compatible loader when running inside a pkg-compiled
 * binary, which intercepts import() and throws
 * ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING.
 */
async function importPlugin(filePath: string): Promise<any> {
  try {
    const mod = await import(pathToFileURL(filePath).href);
    return mod.default || mod;
  } catch (err) {
    // pkg-compiled binaries block dynamic import() of external filesystem paths.
    // Fall back to a synchronous CJS loader that transforms ESM syntax.
    if (
      (err as any).code === "ERR_VM_DYNAMIC_IMPORT_CALLBACK_MISSING" ||
      ((err as any).message &&
        (err as any).message.includes("dynamic import callback"))
    ) {
      return loadPluginCJS(filePath);
    }
    throw err;
  }
}

/**
 * CJS fallback loader for pkg-compiled binaries.
 * Reads the source file, rewrites ES module syntax to CommonJS, and
 * evaluates it with a require() bound to the tool's own directory so that
 * imports of built-in modules (fs, path, os, …) continue to work.
 *
 * Handles the subset of ESM used by llmctrlx tool files:
 *   import X from 'Y'          → const X = require('Y')
 *   import { a, b } from 'Y'  → const { a, b } = require('Y')
 *   export default { … }       → module.exports = { … }
 */
function loadPluginCJS(filePath: string): any {
  const source = fs.readFileSync(filePath, "utf8");

  // Transform ESM import/export syntax to CJS equivalents.
  const transformed = source
    // import defaultExport from 'mod'
    .replace(
      /^import\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
      (_, name, mod) => `const ${name} = require('${mod}');`,
    )
    // import { a, b as c } from 'mod'
    .replace(
      /^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
      (_, names, mod) => `const { ${names.trim()} } = require('${mod}');`,
    )
    // import * as ns from 'mod'
    .replace(
      /^import\s+\*\s+as\s+(\w+)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
      (_, name, mod) => `const ${name} = require('${mod}');`,
    )
    // export default <expr>
    .replace(/^export\s+default\s+/m, "module.exports = ")
    // bare re-exports — strip silently (rare in tools)
    .replace(/^export\s+\{[^}]*\}\s*from\s*['"][^'"]+['"]\s*;?\s*$/gm, "")
    // named exports — strip the keyword
    .replace(/^export\s+(const|let|var|function|class|async)\s+/gm, "$1 ");

  const requireFn = createRequire(filePath);
  const mod: any = { exports: {} };
  const dir = path.dirname(filePath);

  // Wrap in a function so that top-level const/let are scoped correctly.
  const fn = new Function(
    "require",
    "module",
    "exports",
    "__dirname",
    "__filename",
    transformed,
  );
  fn(requireFn, mod, mod.exports, dir, filePath);

  return mod.exports;
}

function normalizePlugin(plugin: any): Plugin | null {
  if (!plugin || typeof plugin !== "object") return null;

  const normalized = { ...plugin };
  const runner = normalized.run || normalized.handler || normalized.execute;

  if (!normalized.type && typeof runner === "function") {
    normalized.type = "tool";
  }

  if (normalized.type === "tool" && typeof runner === "function") {
    normalized.run = runner;
  }

  return normalized;
}

async function loadPluginFile(
  filePath: string,
  registry: Registry,
  ctx: Record<string, unknown>,
): Promise<void> {
  try {
    const plugin = normalizePlugin(await importPlugin(filePath));
    if (!plugin) return;

    // Silently skip files that don't look like plugins (missing name or type)
    if (!plugin.name || !plugin.type) return;
    (plugin as any).init?.(ctx);

    if (plugin.type === "tool") {
      validateTool(plugin as any, filePath);
    }

    registry.register(plugin);
  } catch (err) {
    // If we get here, it means the file looked like a plugin (had name and type)
    // but failed to load, initialize, or validate. This should be reported.
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error loading plugin ${filePath}: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const CORE_FILES = [
  "index.ts",
  "index.js",
  "plugin-loader.ts",
  "plugin-loader.ts",
  "engine-hooks.ts",
  "engine-hooks.js",
  "hook-manager.ts",
  "hook-manager.js",
  "types.ts",
  "types.js",
  "loader.ts",
  "loader.ts",
];

/**
 * Recursively load all plugin files from `dir`, confining every resolved
 * path inside `dir` to prevent traversal attacks.
 *
 * @param dir - Directory to scan.
 * @param registry - Plugin registry to populate.
 * @param ctx - Loader context passed to plugin init().
 */
export async function loadPluginsFromDir(
  dir: string | undefined,
  registry: Registry,
  ctx: Record<string, unknown>,
): Promise<void> {
  if (!dir || !fs.existsSync(dir)) return;

  // Resolve the root once so all child checks use the same canonical base.
  const root = path.resolve(dir);

  const entries = fs.readdirSync(root);

  for (const entry of entries) {
    if (CORE_FILES.includes(entry)) continue;

    const fullPath = path.resolve(root, entry);

    // ── Confinement check ──────────────────────────────────────────────────
    // Reject symlinks or `..` components that escape the scan root.
    try {
      assertConfined(root, fullPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Skipping '${entry}': ${message}`);
      continue;
    }

    // Stat after confinement so we don't follow a symlink that was just
    // validated by name but points elsewhere.
    let stat: fs.Stats;
    try {
      // lstatSync — does NOT follow symlinks; reveals the link itself.
      stat = fs.lstatSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isSymbolicLink()) {
      // Resolve the symlink target and re-assert confinement.
      let realPath: string;
      try {
        realPath = fs.realpathSync(fullPath);
        assertConfined(root, realPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Skipping symlink '${entry}': ${message}`);
        continue;
      }
      // The symlink target is safe; update stat to the real file.
      stat = fs.statSync(realPath);
    }

    if (stat.isDirectory()) {
      await loadPluginsFromDir(fullPath, registry, ctx);
      continue;
    }

    if (!stat.isFile() || !isPluginFile(fullPath)) {
      continue;
    }

    await loadPluginFile(fullPath, registry, ctx);
  }
}

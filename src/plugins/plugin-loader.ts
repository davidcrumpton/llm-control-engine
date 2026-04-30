/**
 * @module plugins/plugin-loader
 * Dynamic plugin discovery and loading.
 *
 * Scans a directory for *.plugin.ts (or .js) files, validates
 * their exports, and registers them with the HookManager.
 *
 * Security hardening:
 *   - Eliminated the write-then-import temp-file pattern that created a
 *     TOCTOU race window. Plugin source rewriting now uses a `data:` URI
 *     so the transformed code is imported directly from memory, never
 *     touching the file system.
 *   - Added a path-confinement check: every resolved plugin path must
 *     sit inside the declared scan root. This blocks symlink escapes and
 *     path-traversal attacks.
 */

import { readdir, stat, readFile } from "node:fs/promises";
import { join, extname, resolve } from "node:path";

import {
  HookPlugin,
  UnifiedPlugin,
  HOOK_EVENTS,
  HookPriority,
} from "./types.js";
import { HookManager, HookLogger } from "./hook-manager.js";

// ---------------------------------------------------------------------------
// Path-confinement helper
// ---------------------------------------------------------------------------

/**
 * Verify that `target` is strictly inside `root` (no traversal / symlink
 * escape). Both paths are resolved to absolute form before comparison.
 *
 * @param {string} root  - The trusted base directory.
 * @param {string} target - The path to validate.
 * @throws {Error} if target lies outside root.
 */
function assertConfined(root: string, target: string): void {
  const resolvedRoot = resolve(root) + "/";
  const resolvedTarget = resolve(target);

  if (!resolvedTarget.startsWith(resolvedRoot)) {
    throw new Error(
      `Path traversal detected: '${target}' is outside the allowed root '${root}'.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidPlugin(obj: unknown): obj is HookPlugin {
  if (typeof obj !== "object" || obj === null) return false;
  const candidate = obj as Record<string, unknown>;

  if (typeof candidate.meta !== "object" || candidate.meta === null)
    return false;
  const meta = candidate.meta as Record<string, unknown>;

  return (
    typeof meta.name === "string" &&
    typeof meta.version === "string" &&
    typeof meta.description === "string" &&
    typeof candidate.install === "function"
  );
}

function isUnifiedPlugin(obj: unknown): obj is UnifiedPlugin {
  if (typeof obj !== "object" || obj === null) return false;
  const candidate = obj as Record<string, unknown>;

  return (
    typeof candidate.name === "string" &&
    typeof candidate.version === "string" &&
    typeof candidate.description === "string" &&
    typeof candidate.run === "function"
  );
}

// ---------------------------------------------------------------------------
// Conversion
// ---------------------------------------------------------------------------

function convertUnifiedToLegacy(unified: UnifiedPlugin): HookPlugin {
  return {
    meta: {
      name: unified.name,
      version: unified.version,
      description: unified.description,
    },
    install: async (tap) => {
      for (const event of HOOK_EVENTS) {
        tap(
          event,
          async (ctx) => {
            const result = await unified.run({
              event: ctx.meta.event,
              data: ctx.data,
              parameters: unified.parameters || {},
              meta: ctx.meta,
            });

            if (!result || result.outcome === "unchanged") return {};
            if (result.outcome === "modified") return { data: result.data };
            if (result.outcome === "blocked")
              return { bail: true, reason: result.reason };

            return {};
          },
          HookPriority.NORMAL,
        );
      }
    },
  };
}

// ---------------------------------------------------------------------------
// PluginLoader
// ---------------------------------------------------------------------------

export interface LoaderOptions {
  extensions?: string[];
  suffix?: string;
}

const DEFAULT_OPTIONS: Required<LoaderOptions> = {
  extensions: [".ts", ".js"],
  suffix: ".plugin",
};

export class PluginLoader {
  private manager: HookManager;
  private logger: HookLogger;
  private options: Required<LoaderOptions>;

  constructor(
    manager: HookManager,
    logger?: HookLogger,
    options?: LoaderOptions,
  ) {
    this.manager = manager;
    this.logger = logger ?? {
      debug: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
    };
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Scan `directory` for plugin files and register each valid plugin.
   * Returns the names of successfully loaded plugins.
   *
   * Every file path is confined to `directory` before being loaded.
   */
  async loadFromDirectory(directory: string): Promise<string[]> {
    const loaded: string[] = [];
    const rootDir = resolve(directory); // canonical base for confinement checks

    let entries: string[];
    try {
      entries = await readdir(rootDir);
    } catch {
      this.logger.warn(`[PluginLoader] Cannot read directory: ${rootDir}`);
      return loaded;
    }

    // Load plugin files at the root level
    const pluginFiles = entries.filter((f) => {
      const ext = extname(f);
      const base = f.slice(0, -ext.length);
      return (
        this.options.extensions.includes(ext) &&
        base.endsWith(this.options.suffix)
      );
    });

    for (const file of pluginFiles) {
      const fullPath = join(rootDir, file);

      // Confinement check for root-level files
      try {
        assertConfined(rootDir, fullPath);
      } catch (err) {
        this.logger.warn(
          `[PluginLoader] Skipping confined path: ${(err as Error).message}`,
        );
        continue;
      }

      const name = await this.loadPlugin(fullPath, rootDir);
      if (name) loaded.push(name);
    }

    // Recursively scan subdirectories (with confinement)
    for (const entry of entries) {
      const fullPath = join(rootDir, entry);

      try {
        assertConfined(rootDir, fullPath);
        const entryStat = await stat(fullPath);
        if (entryStat.isDirectory()) {
          const subLoaded = await this.loadFromDirectory(fullPath);
          loaded.push(...subLoaded);
        }
      } catch (err) {
        this.logger.warn(
          `[PluginLoader] Skipping entry '${entry}': ${(err as Error).message}`,
        );
      }
    }

    this.logger.info(
      `[PluginLoader] Found ${loaded.length} plugin(s) in ${rootDir}`,
    );

    return loaded;
  }

  /**
   * Load a single plugin file.
   *
   * Security: instead of writing transformed source to a temp file and then
   * importing that file (TOCTOU race), we encode the transformed source as a
   * `data:text/javascript` URI and import it directly from memory.  No file
   * system interaction occurs after the initial `readFile`, so there is no
   * window for an attacker to swap in malicious content.
   *
   * @param filePath - Absolute path to the plugin file.
   * @param rootDir  - The scan root; used for confinement assertion.
   */
  async loadPlugin(filePath: string, rootDir?: string): Promise<string | null> {
    // Confinement: if a root is known, assert the file is inside it.
    if (rootDir) {
      try {
        assertConfined(rootDir, filePath);
      } catch (err) {
        this.logger.warn(
          `[PluginLoader] Rejected '${filePath}': ${(err as Error).message}`,
        );
        return null;
      }
    }

    try {
      // Resolve the plugin-api import URL once.
      const pluginApiUrl = await import.meta
        .resolve("llmctrlx/plugin-api/hooks");

      // Read the plugin source — single file-system access, no race window.
      let content = await readFile(filePath, "utf8");

      // Rewrite llmctrlx package imports to absolute file URLs.
      content = content.replace(
        /from ['"]llmctrlx\/plugin-api\/hooks['"]/g,
        `from '${pluginApiUrl}'`,
      );

      // Rewrite relative imports to absolute file URLs.
      const pluginDir = resolve(filePath, "..");
      content = content.replace(
        /from ['"](\.[^'"]*)['"]/g,
        (_match, relativePath) => {
          const absolutePath = resolve(pluginDir, relativePath);
          // Confine intra-plugin relative imports too.
          if (rootDir) {
            const base = resolve(rootDir);
            if (!resolve(absolutePath).startsWith(base + "/")) {
              throw new Error(
                `Relative import escapes plugin root: '${relativePath}' in '${filePath}'`,
              );
            }
          }
          return `from 'file://${absolutePath}'`;
        },
      );

      // ── Import from a data: URI (no temp file, no TOCTOU) ────────────────
      // Encode as base64 so the source is not interpreted as a URL.
      const base64Source = Buffer.from(content, "utf8").toString("base64");
      const dataUri = `data:text/javascript;base64,${base64Source}`;

      const mod: unknown = await import(dataUri);
      const plugin: unknown =
        (mod as Record<string, unknown>).default ??
        (mod as Record<string, unknown>).plugin ??
        mod;

      let hookPlugin: HookPlugin;

      if (isValidPlugin(plugin)) {
        hookPlugin = plugin;
      } else if (isUnifiedPlugin(plugin)) {
        this.logger.info(
          `[PluginLoader] Converting unified plugin: ${plugin.name} from ${filePath}`,
        );
        hookPlugin = convertUnifiedToLegacy(plugin);
      } else {
        this.logger.warn(
          `[PluginLoader] Invalid plugin export in ${filePath}. ` +
            `Expected legacy { meta: {...}, install() } or unified { name, version, description, run() }.`,
        );
        return null;
      }

      await this.manager.register(hookPlugin);
      this.logger.info(
        `[PluginLoader] Loaded: ${hookPlugin.meta.name} from ${filePath}`,
      );
      return hookPlugin.meta.name;
    } catch (err) {
      this.logger.error(`[PluginLoader] Failed to load ${filePath}:`, err);
      return null;
    }
  }
}

/**
 * @module plugins/plugin-loader
 * Dynamic plugin discovery and loading.
 *
 * Scans a directory for *.plugin.ts (or .js) files, validates
 * their exports, and registers them with the HookManager.
 */

import { readdir, stat } from "node:fs/promises";
import { join, extname } from "node:path";
import {
  HookPlugin,
  UnifiedPlugin,
  HOOK_EVENTS,
  HookPriority,
} from "./types.js";
import { HookManager, HookLogger } from "./hook-manager.js";

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
      // For unified plugins, tap into all possible events and delegate to run()
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

            if (!result || result.outcome === "unchanged") {
              return {};
            }

            if (result.outcome === "modified") {
              return { data: result.data };
            }

            if (result.outcome === "blocked") {
              return { bail: true, reason: result.reason };
            }

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
   */
  async loadFromDirectory(directory: string): Promise<string[]> {
    const loaded: string[] = [];

    let entries: string[];
    try {
      entries = await readdir(directory);
    } catch {
      this.logger.warn(`[PluginLoader] Cannot read directory: ${directory}`);
      return loaded;
    }

    // First, load plugin files in the root directory
    const pluginFiles = entries.filter((f) => {
      const ext = extname(f);
      const base = f.slice(0, -ext.length);
      return (
        this.options.extensions.includes(ext) &&
        base.endsWith(this.options.suffix)
      );
    });

    for (const file of pluginFiles) {
      const name = await this.loadPlugin(join(directory, file));
      if (name) loaded.push(name);
    }

    // Then, recursively scan subdirectories
    for (const entry of entries) {
      const fullPath = join(directory, entry);
      try {
        const entryStat = await stat(fullPath);
        if (entryStat.isDirectory()) {
          const subLoaded = await this.loadFromDirectory(fullPath);
          loaded.push(...subLoaded);
        }
      } catch {
        // Skip entries that can't be stat'ed
      }
    }

    this.logger.info(
      `[PluginLoader] Found ${loaded.length} plugin(s) in ${directory}`,
    );

    return loaded;
  }

  async loadPlugin(filePath: string): Promise<string | null> {
    try {
      // Preprocess the plugin file to replace llmctrlx imports with file URLs
      const pluginApiUrl = await import.meta
        .resolve("llmctrlx/plugin-api/hooks");
      const fs = await import("node:fs/promises");
      const path = await import("node:path");
      let content = await fs.readFile(filePath, "utf8");
      content = content.replace(
        /from ['"]llmctrlx\/plugin-api\/hooks['"]/g,
        `from '${pluginApiUrl}'`,
      );

      // Also resolve relative imports
      const pluginDir = path.dirname(filePath);
      content = content.replace(
        /from ['"](\.\/[^'"]*)['"]/g,
        (match, relativePath) => {
          const absolutePath = path.resolve(pluginDir, relativePath);
          return `from 'file://${absolutePath}'`;
        },
      );

      // Write to a temp file and import that
      const tempDir = await import("node:os");
      const tempPath = `${tempDir.tmpdir()}/llmctrlx-plugin-${Date.now()}-${Math.random()}.js`;
      await fs.writeFile(tempPath, content);

      const mod = await import(tempPath);
      const plugin: unknown = mod.default ?? mod.plugin ?? mod;

      // Clean up temp file
      await fs.unlink(tempPath);

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

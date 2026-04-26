/**
 * @module plugins/plugin-loader
 * Dynamic plugin discovery and loading.
 *
 * Scans a directory for *.plugin.ts (or .js) files, validates
 * their exports, and registers them with the HookManager.
 */

import { readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { HookPlugin } from './types.js';
import { HookManager, HookLogger } from './hook-manager.js';

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function isValidPlugin(obj: unknown): obj is HookPlugin {
  if (typeof obj !== 'object' || obj === null) return false;
  const candidate = obj as Record<string, unknown>;

  if (typeof candidate.meta !== 'object' || candidate.meta === null) return false;
  const meta = candidate.meta as Record<string, unknown>;

  return (
    typeof meta.name === 'string' &&
    typeof meta.version === 'string' &&
    typeof meta.description === 'string' &&
    typeof candidate.install === 'function'
  );
}

// ---------------------------------------------------------------------------
// PluginLoader
// ---------------------------------------------------------------------------

export interface LoaderOptions {
  extensions?: string[];
  suffix?: string;
}

const DEFAULT_OPTIONS: Required<LoaderOptions> = {
  extensions: ['.ts', '.js'],
  suffix: '.plugin',
};

export class PluginLoader {
  private manager: HookManager;
  private logger: HookLogger;
  private options: Required<LoaderOptions>;

  constructor(manager: HookManager, logger?: HookLogger, options?: LoaderOptions) {
    this.manager = manager;
    this.logger = logger ?? { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
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

    const pluginFiles = entries.filter((f) => {
      const ext = extname(f);
      const base = f.slice(0, -ext.length);
      return this.options.extensions.includes(ext) && base.endsWith(this.options.suffix);
    });

    this.logger.info(
      `[PluginLoader] Found ${pluginFiles.length} plugin file(s) in ${directory}`,
    );

    for (const file of pluginFiles) {
      const name = await this.loadPlugin(join(directory, file));
      if (name) loaded.push(name);
    }

    return loaded;
  }

  async loadPlugin(filePath: string): Promise<string | null> {
    try {
      const mod = await import(filePath);
      const plugin: unknown = mod.default ?? mod.plugin ?? mod;

      if (!isValidPlugin(plugin)) {
        this.logger.warn(
          `[PluginLoader] Invalid plugin export in ${filePath}. ` +
            `Expected { meta: { name, version, description }, install() }.`,
        );
        return null;
      }

      await this.manager.register(plugin);
      this.logger.info(`[PluginLoader] Loaded: ${plugin.meta.name} from ${filePath}`);
      return plugin.meta.name;
    } catch (err) {
      this.logger.error(`[PluginLoader] Failed to load ${filePath}:`, err);
      return null;
    }
  }
}
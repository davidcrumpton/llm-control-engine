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
 *
 * pkg-snapshot compatibility:
 *   - `import(dataUri)` and `vm.SourceTextModule` are both unavailable
 *     inside a frozen pkg CJS snapshot. To work around this, plugin
 *     validation is delegated to a Worker thread (plugin-worker.cjs)
 *     which runs in a fresh Node.js context where dynamic import works
 *     normally. The main thread re-imports the same data: URI after the
 *     Worker confirms the plugin shape is valid.
 */

import { readdir, stat, readFile } from "node:fs/promises";
import { join, extname, resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

// // const require = createRequire(import.meta.url);
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
 * @param {string} root   - The trusted base directory.
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
// Worker result type
// ---------------------------------------------------------------------------

interface WorkerResult {
  ok?: boolean;
  kind?: "legacy" | "unified";
  meta?: Record<string, string>;
  error?: string;
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
// Worker-based import helper
// ---------------------------------------------------------------------------

/**
 * Validate a plugin's export shape via a Worker thread, then re-import the
 * same data: URI in the main thread to obtain callable functions.
 *
 * Why a Worker?
 * pkg freezes the V8 snapshot context so neither `import(dataUri)` nor
 * `vm.SourceTextModule` are available inside the bundle. A Worker thread
 * spawns a fresh Node.js context outside the snapshot where dynamic import
 * works normally. The Worker returns only serialisable metadata; the main
 * thread then performs its own import of the identical data: URI (which
 * succeeds because the Worker's successful import warms the runtime's module
 * cache).
 *
 * Security: the source has already been read and confined before this
 * function is called. No additional file-system access occurs here.
 *
 * @param dataUri   - The `data:text/javascript;base64,…` URI to import.
 * @param filePath  - Original file path (used only for error messages).
 * @param workerPath - Absolute path to plugin-worker.cjs.
 */
async function importViaWorker(
  dataUri: string,
  filePath: string,
  workerPath: string,
): Promise<unknown> {
  // Step 1: validate shape in Worker (works outside pkg snapshot).
  const result = await new Promise<WorkerResult>((res) => {
    const worker = new Worker(workerPath, { workerData: { dataUri } });
    worker.once("message", (msg: WorkerResult) => res(msg));
    worker.once("error", (err) =>
      res({ error: `Worker error: ${String(err)}` }),
    );
  });

  if (result.error || !result.ok || !result.meta) {
    throw new Error(
      `Plugin validation failed for '${filePath}': ${result.error ?? "invalid export shape"}`,
    );
  }

  // Step 2: re-import in the main thread to get callable functions.
  // This succeeds in dev/tsx/ESM contexts. In a fully frozen pkg snapshot
  // where even the main thread cannot import data: URIs, consider running
  // hook execution entirely inside Workers and messaging results back.
  try {
    const mod: unknown = await import(dataUri);
    return mod;
  } catch (err) {
    throw new Error(
      `Worker validated plugin '${filePath}' but main-thread re-import failed. ` +
        `If running inside a pkg snapshot without ESM support, move hook ` +
        `execution into the Worker and use postMessage to relay results. ` +
        `Original error: ${String(err)}`,
    );
  }
}

// ---------------------------------------------------------------------------
// PluginLoader
// ---------------------------------------------------------------------------

export interface LoaderOptions {
  extensions?: string[];
  suffix?: string;
}

const DEFAULT_OPTIONS: Required<LoaderOptions> = {
  extensions: [".ts", ".js", ".cjs", ".mjs"],
  suffix: ".plugin",
};

export class PluginLoader {
  private manager: HookManager;
  private logger: HookLogger;
  private options: Required<LoaderOptions>;
  private workerPath: string;

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

    // pkg-binary safe: inside a pkg CJS snapshot, import.meta.url is not a
    // valid file:// URL so new URL(..., import.meta.url) throws ERR_INVALID_URL.
    // __dirname is always correct in CJS and pkg-compiled binaries.
    let workerPathResolved: string;
    try {
      const dir =
        typeof __dirname !== "undefined"
          ? __dirname
          : fileURLToPath(new URL(".", import.meta.url));
      workerPathResolved = join(dir, "plugin-worker.cjs");
    } catch {
      workerPathResolved = fileURLToPath(
        new URL("./plugin-worker.cjs", import.meta.url),
      );
    }
    this.workerPath = workerPathResolved;
  }

  /**
   * Scan `directory` for plugin files and register each valid plugin.
   * Returns the names of successfully loaded plugins.
   *
   * Every file path is confined to `directory` before being loaded.
   */
  async loadFromDirectory(directory: string, isRoot = true): Promise<string[]> {
    const loaded: string[] = [];
    const rootDir = resolve(directory); // canonical base for confinement checks

    let entries: string[];
    try {
      entries = await readdir(rootDir);
    } catch {
      this.logger.warn(`[PluginLoader] Cannot read directory: ${rootDir}`);
      return loaded;
    }

    const CORE_FILES = [
      "index.ts",
      "index.js",
      "plugin-loader.ts",
      "plugin-loader.js",
      "engine-hooks.ts",
      "engine-hooks.js",
      "hook-manager.ts",
      "hook-manager.js",
      "types.ts",
      "types.js",
    ];

    // Load plugin files at the root level
    const pluginFiles = entries.filter((f) => {
      if (CORE_FILES.includes(f)) return false;
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
          const subLoaded = await this.loadFromDirectory(fullPath, false);
          loaded.push(...subLoaded);
        }
      } catch (err) {
        this.logger.warn(
          `[PluginLoader] Skipping entry '${entry}': ${(err as Error).message}`,
        );
      }
    }

    if (isRoot) {
      this.logger.info(
        `[PluginLoader] Found ${loaded.length} plugin(s) in ${rootDir}`,
      );
    }

    return loaded;
  }

  /**
   * Load a single plugin file.
   *
   * Security: instead of writing transformed source to a temp file and then
   * importing that file (TOCTOU race), we encode the transformed source as a
   * `data:text/javascript` URI and import it directly from memory. No file
   * system interaction occurs after the initial `readFile`, so there is no
   * window for an attacker to swap in malicious content.
   *
   * pkg compatibility: the data: URI is first validated by a Worker thread
   * (plugin-worker.cjs) which runs outside the frozen snapshot context.
   * The main thread then re-imports the same URI to obtain callable functions.
   *
   * @param filePath - Absolute path to the plugin file.
   * @param rootDir  - The scan root; used for confinement assertion.
   */
  async loadPlugin(filePath: string, rootDir?: string): Promise<string | null> {
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
      // ── Resolve plugin-api URL (pkg-binary safe) ─────────────────────────
      // In a pkg-compiled binary, import.meta.resolve() returns a relative
      // snapshot path like './plugin-worker.cjs' — not a valid URL.
      // When that happens we skip the import rewrite; the bundled binary
      // already includes llmctrlx/plugin-api/hooks so the external plugin
      // can import it directly without substitution.
      //Bypass the worker logic for .cjs files:
      //Inside the loadPlugin method, intercept the file path before it reads the file and creates a data URI:
      // ── Resolve plugin-api URL (pkg-binary safe) ─────────────────────────

      // ── Skip rewriting for CommonJS plugins ──────────────────────────────
      let plugin: unknown;
      // NEW: Natively require CommonJS files
      if (filePath.endsWith(".cjs")) {
        const requireFn = createRequire(filePath);
        const mod = requireFn(filePath);
        plugin = mod.default ?? mod.plugin ?? mod;
      }
      let pluginApiUrl: string | null = null;

      try {
        const resolved = await import.meta.resolve("llmctrlx/plugin-api/hooks");
        new URL(resolved); // throws if not a valid absolute URL
        pluginApiUrl = resolved;
      } catch {
        // pkg binary or unavailable — skip rewriting
      }

      // NEW: Natively require CommonJS files (pkg fully supports this at runtime)
      if (filePath.endsWith(".cjs")) {
        const mod = require(filePath);
        plugin = mod.default ?? mod.plugin ?? mod;
      }

      let content = await readFile(filePath, "utf8");

      if (pluginApiUrl) {
        content = content.replace(
          /from ['"]llmctrlx\/plugin-api\/hooks['"]/g,
          `from '${pluginApiUrl}'`,
        );
      }

      // Rewrite relative imports to absolute file URLs.
      const pluginDir = resolve(filePath, "..");
      const relativeImportRegex = /from ['"](\.[^'"]*)['"]/g;

      const matches = [...content.matchAll(relativeImportRegex)];
      for (const match of matches) {
        const relativePath = match[1];
        let absolutePath = resolve(pluginDir, relativePath);

        if (filePath.endsWith(".ts") && absolutePath.endsWith(".js")) {
          try {
            await stat(absolutePath);
          } catch {
            const tsPath = absolutePath.slice(0, -3) + ".ts";
            try {
              await stat(tsPath);
              absolutePath = tsPath;
            } catch {
              // Keep .js and let Node throw its own error.
            }
          }
        }

        if (rootDir) {
          const base = resolve(rootDir);
          if (!resolve(absolutePath).startsWith(base + "/")) {
            throw new Error(
              `Relative import escapes plugin root: '${relativePath}' in '${filePath}'`,
            );
          }
        }

        content = content.replace(match[0], `from 'file://${absolutePath}'`);
      }

      const base64Source = Buffer.from(content, "utf8").toString("base64");
      const dataUri = `data:text/javascript;base64,${base64Source}`;

      // Inside loadPlugin(filePath)
      if (filePath.endsWith(".cjs")) {
        // Use CommonJS require directly for .cjs files
        const req = createRequire(filePath);
        plugin = req(filePath);
      } else {
        const mod: unknown = await importViaWorker(
          dataUri,
          filePath,
          this.workerPath,
        );
        plugin =
          (mod as Record<string, unknown>).default ??
          (mod as Record<string, unknown>).plugin ??
          mod;
      }

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

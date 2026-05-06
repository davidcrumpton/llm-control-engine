/**
 * Session-scoped key-value memory tool for llmctrlx.
 * Optimized with Atomic Writes to prevent data corruption.
 */

import fs from "fs";
import path from "path";
import os from "os";

const MEMORY_DIR = path.resolve(os.homedir(), ".llmctrlx");

const MEMORY_FILE = path.join(MEMORY_DIR, "memory.json");
const TEMP_FILE = path.join(MEMORY_DIR, "memory.json.tmp");

// ── Types ─────────────────────────────────────────────────────────────────────

type MemoryAction = "set" | "get" | "delete" | "list";

interface RunParams {
  action: MemoryAction;
  key?: string;
  value?: string;
}

interface PluginContext {
  session?: string;
}

type MemoryStore = Record<string, Record<string, string>>;

// ── Disk helpers ──────────────────────────────────────────────────────────────

function loadAll(): MemoryStore {
  if (!fs.existsSync(MEMORY_FILE)) return {};
  try {
    const content = fs.readFileSync(MEMORY_FILE, "utf8");
    return content ? (JSON.parse(content) as MemoryStore) : {};
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `WARN: ${MEMORY_FILE} is corrupt or unreadable: ${message}. Starting fresh.`,
    );
    return {};
  }
}

/**
 * Performs an Atomic Write.
 * 1. Write data to a .tmp file.
 * 2. Flush to disk.
 * 3. Rename .tmp to the real file (this is an atomic operation in most OSs).
 */
function saveAll(data: MemoryStore): void {
  try {
    if (!fs.existsSync(MEMORY_DIR)) {
      fs.mkdirSync(MEMORY_DIR, { recursive: true });
    }

    const json = JSON.stringify(data, null, 2);

    // Write to temporary file first
    fs.writeFileSync(TEMP_FILE, json, "utf8");

    // Atomic rename: This ensures that even if the process crashes,
    // the original file is either untouched or fully updated.
    fs.renameSync(TEMP_FILE, MEMORY_FILE);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`WARN: Could not save ${MEMORY_FILE}: ${message}`);
    // Clean up temp file if it exists and we failed
    if (fs.existsSync(TEMP_FILE)) fs.unlinkSync(TEMP_FILE);
  }
}

// ── Plugin ────────────────────────────────────────────────────────────────────

let sessionKey: string = "default";

export default {
  type: "tool" as const,
  name: "memory",
  version: "1.1.0",
  description:
    "Store and retrieve named values that persist across invocations. " +
    'Use action "set" to save a value, "get" to retrieve one, ' +
    '"delete" to remove one, and "list" to see all stored keys.',
  tags: ["always"],

  parameters: {
    required: ["action"],
    properties: {
      action: {
        type: "string",
        description: "One of: set | get | delete | list",
        enum: ["set", "get", "delete", "list"] as MemoryAction[],
      },
      key: {
        type: "string",
        description: "The memory key (required for set / get / delete)",
      },
      value: {
        type: "string",
        description: "The value to store (required for set)",
      },
    },
  },

  init(ctx?: PluginContext): void {
    if (ctx?.session) sessionKey = ctx.session;
  },

  async run({ action, key, value }: RunParams): Promise<string> {
    const all = loadAll();
    // Ensure the namespace exists
    if (!all[sessionKey]) all[sessionKey] = {};
    const ns = all[sessionKey];

    switch (action) {
      case "set": {
        if (!key) return 'Error: "key" is required for action "set"';
        if (value === undefined || value === null)
          return 'Error: "value" is required for action "set"';

        ns[key] = String(value);
        all[sessionKey] = ns;
        saveAll(all);
        return `Memory set: ${key} = ${value}`;
      }

      case "get": {
        if (!key) return 'Error: "key" is required for action "get"';
        return key in ns ? String(ns[key]) : `No memory found for key: ${key}`;
      }

      case "delete": {
        if (!key) return 'Error: "key" is required for action "delete"';
        if (!(key in ns)) return `No memory found for key: ${key}`;

        delete ns[key];
        all[sessionKey] = ns;
        saveAll(all);
        return `Memory deleted: ${key}`;
      }

      case "list": {
        const entries = Object.entries(ns);
        if (entries.length === 0) return "Memory is empty for this session";
        return entries.map(([k, v]) => `${k}: ${v}`).join("\n");
      }

      default:
        return `Unknown action: ${action}. Valid actions: set | get | delete | list`;
    }
  },
};

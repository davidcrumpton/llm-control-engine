/**
 * Session-scoped key-value memory tool for llmctrlx.
 *
 * Persists to ~/.llmctrlx/memory.json, keyed by session name so each
 * session has its own isolated namespace.  Safe to call across process
 * restarts because all reads and writes go directly to disk.
 */

import fs   from 'fs'
import path from 'path'
import os   from 'os'

const MEMORY_FILE = path.resolve(os.homedir(), '.llmctrlx', 'memory.json')

// ── Disk helpers ─────────────────────────────────────────────────────────────

function loadAll() {
  if (!fs.existsSync(MEMORY_FILE)) return {}
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'))
  } catch {
    console.warn('WARN: memory.json is corrupt; starting fresh.')
    return {}
  }
}

function saveAll(data) {
  try {
    fs.mkdirSync(path.dirname(MEMORY_FILE), { recursive: true })
    fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2))
  } catch (err) {
    console.warn(`WARN: Could not save memory.json: ${err.message}`)
  }
}

// ── Plugin ───────────────────────────────────────────────────────────────────

let sessionKey = 'default'

export default {
  type: 'tool',
  name: 'memory',
  version: '1.0.0',
  description:
    'Store and retrieve named values that persist across invocations. ' +
    'Use action "set" to save a value, "get" to retrieve one, ' +
    '"delete" to remove one, and "list" to see all stored keys.',
  tags: ['always'],

  parameters: {
    required: ['action'],
    properties: {
      action: {
        type: 'string',
        description: 'One of: set | get | delete | list',
        required: true,
      },
      key: {
        type: 'string',
        description: 'The memory key (required for set / get / delete)',
      },
      value: {
        type: 'string',
        description: 'The value to store (required for set)',
      },
    },
  },

  init(ctx) {
    if (ctx?.session) sessionKey = ctx.session
  },

  async run({ action, key, value }) {
    const all     = loadAll()
    const ns      = all[sessionKey] ?? {}

    switch (action) {
      case 'set': {
        if (!key)              return 'Error: "key" is required for action "set"'
        if (value === undefined) return 'Error: "value" is required for action "set"'
        ns[key]            = value
        all[sessionKey]    = ns
        saveAll(all)
        return `Memory set: ${key} = ${value}`
      }

      case 'get': {
        if (!key) return 'Error: "key" is required for action "get"'
        return key in ns ? String(ns[key]) : `No memory found for key: ${key}`
      }

      case 'delete': {
        if (!key) return 'Error: "key" is required for action "delete"'
        if (!(key in ns)) return `No memory found for key: ${key}`
        delete ns[key]
        all[sessionKey] = ns
        saveAll(all)
        return `Memory deleted: ${key}`
      }

      case 'list': {
        const entries = Object.entries(ns)
        if (entries.length === 0) return 'Memory is empty for this session'
        return entries.map(([k, v]) => `${k}: ${v}`).join('\n')
      }

      default:
        return `Unknown action: ${action}. Valid actions: set | get | delete | list`
    }
  },
}
/**
 * Plugin registry for llmctrlx
 */

export class Registry {
  constructor() {
    this.plugins = {
      tool: new Map(),
      policy: new Map(),
      provider: new Map(),
      hook: new Map()
    }
  }

  register(plugin) {
    if (!plugin || typeof plugin !== 'object') {
      throw new Error('Invalid plugin')
    }

    const { type, name } = plugin

    if (!type || typeof type !== 'string') {
      throw new Error('Plugin missing valid type')
    }

    if (!name || typeof name !== 'string') {
      throw new Error('Plugin missing valid name')
    }

    const bucket = this.plugins[type]
    if (!bucket) {
      throw new Error(`Unsupported plugin type: ${type}`)
    }

    bucket.set(name, plugin)
  }

  get(type, name) {
    const bucket = this.plugins[type]
    return bucket ? bucket.get(name) : undefined
  }

  list(type) {
    const bucket = this.plugins[type]
    return bucket ? [...bucket.values()] : []
  }

  has(type, name) {
    return this.plugins[type]?.has(name)
  }
}

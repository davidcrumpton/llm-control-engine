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

/**
 * Registers a plugin object into the system's plugin registry.
 * @param {object} plugin - The plugin object containing 'type' and 'name'.
 * @throws {Error} If validation fails at any step.
 */
register(plugin) {
    // 1. Basic input validation (must be a non-null object)
    if (!plugin || typeof plugin !== 'object') {
        throw new Error('Invalid plugin: Plugin must be a valid, non-null object.');
    }

    // 2. Extract and validate required properties
    const type = plugin.type;
    const name = plugin.name;

    if (typeof type !== 'string' || !type) {
        throw new Error('Plugin missing valid type: Plugin must have a non-empty string "type" property.');
    }
    if (typeof name !== 'string' || !name) {
        throw new Error('Plugin missing valid name: Plugin must have a non-empty string "name" property.');
    }

    // 3. Check if the type is supported/registered internally
    const bucket = this.plugins[type];
    if (!bucket) {
        throw new Error(`Unsupported plugin type: "${type}". No corresponding registry found.`);
    }

    // Optional Enhancement: Validate the container structure (assuming Map behavior)
    if (typeof bucket.set !== 'function' || typeof bucket.has !== 'function') {
         console.warn(`Warning: Plugin container for type "${type}" does not appear to be a standard registry (lacks .set() method).`);
         // Depending on requirement, this could throw an error instead of just warning.
    }

    // Optional Enhancement: Check for name collision if strict uniqueness is required
    if (typeof bucket.has === 'function' && bucket.has(name)) {
        throw new Error(`Plugin registration failed: A plugin named "${name}" already exists for type "${type}".`);
    }

    // 4. Perform the actual registration
    bucket.set(name, plugin);
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

/**
 * Plugin registry for llmctrlx
 *
 * Generic typed registry managing tool, policy, provider, and hook plugins
 * with compile-time type safety and runtime validation.
 */

import {
  Plugin,
  PluginType,
  ToolPlugin,
  PolicyPlugin,
  ProviderPlugin,
  HookPlugin,
  BasePlugin,
} from '../types.js'

type PluginMap = {
  tool: Map<string, ToolPlugin>
  policy: Map<string, PolicyPlugin>
  provider: Map<string, ProviderPlugin>
  hook: Map<string, HookPlugin>
}

/**
 * Generic plugin registry maintaining separate type-safe collections
 * for each plugin type (tool, policy, provider, hook).
 */
export class Registry {
  private plugins: PluginMap

  constructor() {
    this.plugins = {
      tool: new Map(),
      policy: new Map(),
      provider: new Map(),
      hook: new Map(),
    }
  }

  /**
   * Register a plugin into the system's plugin registry.
   *
   * @throws {Error} If the plugin fails validation or a name collision occurs
   */
  register(plugin: Plugin): void {
    // 1. Basic input validation (must be a non-null object)
    if (!plugin || typeof plugin !== 'object') {
      throw new Error(
        'Invalid plugin: Plugin must be a valid, non-null object.'
      )
    }

    // 2. Extract and validate required properties
    const type = (plugin as any).type as unknown
    const name = (plugin as any).name as unknown

    if (typeof type !== 'string' || !type) {
      throw new Error(
        'Plugin missing valid type: Plugin must have a non-empty string "type" property.'
      )
    }
    if (typeof name !== 'string' || !name) {
      throw new Error(
        'Plugin missing valid name: Plugin must have a non-empty string "name" property.'
      )
    }

    // 3. Check if the type is supported/registered internally
    const bucket = this.plugins[type as PluginType]
    if (!bucket) {
      throw new Error(
        `Unsupported plugin type: "${type}". No corresponding registry found.`
      )
    }

    // 4. Check for name collision
    if (bucket.has(name)) {
      throw new Error(
        `Plugin registration failed: A plugin named "${name}" already exists for type "${type}".`
      )
    }

    // 5. Perform the actual registration
    ;(bucket as Map<string, any>).set(name, plugin)
  }

  /**
   * Retrieve a plugin by type and name.
   *
   * Generic overloads ensure type-safe returns based on the plugin type requested.
   */
  get(type: 'tool', name: string): ToolPlugin | undefined
  get(type: 'policy', name: string): PolicyPlugin | undefined
  get(type: 'provider', name: string): ProviderPlugin | undefined
  get(type: 'hook', name: string): HookPlugin | undefined
  get(type: PluginType, name: string): Plugin | undefined
  get(type: PluginType, name: string): Plugin | undefined {
    const bucket = this.plugins[type]
    return bucket ? (bucket as Map<string, any>).get(name) : undefined
  }

  /**
   * List all plugins of a given type.
   */
  list(type: 'tool'): ToolPlugin[]
  list(type: 'policy'): PolicyPlugin[]
  list(type: 'provider'): ProviderPlugin[]
  list(type: 'hook'): HookPlugin[]
  list(type: PluginType): Plugin[]
  list(type: PluginType): Plugin[] {
    const bucket = this.plugins[type]
    return bucket ? [...(bucket as Map<string, any>).values()] : []
  }

  /**
   * Check if a plugin is registered.
   */
  has(type: PluginType, name: string): boolean {
    return this.plugins[type]?.has(name) ?? false
  }
}

// Hello World plugin example for llmctrlx.
//
// This is a real tool plugin that can be loaded from the `examples` folder
// using `llmctrlx chat -T examples`. It is intentionally simple, but it
// demonstrates the required plugin structure and a useful output format.

export default {
  type: 'tool',
  name: 'hello-world',
  description: 'Return a friendly greeting and current session details.',
  version: 'v1.0.0',
  tags: ['example', 'utility'],
  parameters: {
    type: 'object',
    properties: {
      name: {
        type: 'string',
        description: 'Optional name to include in the greeting'
      }
    }
  },

  // Optional init hook. This receives runtime context when the plugin is loaded.
  init(ctx) {
    // ctx.toolsDir and ctx.projectDir are available when loading plugins.
    // This is useful if your plugin wants to adapt behavior based on path.
    this.loadedFrom = ctx.toolsDir || ctx.projectDir || process.cwd()
  },

  run: async ({ name } = {}) => {
    const displayName = name ? `, ${name}` : ''
    const now = new Date().toLocaleString()
    return `Hello${displayName}! This plugin is running from: ${process.cwd()}. Current time: ${now}`
  }
}

export default {
  name: 'whatis',
  description: 'Get a short description of a command',
  version: 'v1.0.0',
  tags: ['os', 'system'],
  policies: { maxCalls: 3 },
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string' }
    },
    required: ['command']
  },
  run: async ({ command }) => {
    const { execSync } = await import('child_process')
    try {
      return execSync(`whatis ${command}`, { encoding: 'utf-8' })
    } catch {
      return `No whatis entry for ${command}`
    }
  }
}
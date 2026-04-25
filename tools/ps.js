export default {
  name: 'ps',
  description: 'Get running processes',
  version: 'v1.0.0',
  tags: ['os', 'system'],
  parameters: {
    type: 'object',
    properties: {
      filter: { type: 'string' }
    },
    required: ['filter']
  },
  run: async ({ filter }) => {
    const { execSync } = await import('child_process')
    try {
      return execSync(`ps -f | grep ${filter}`, { encoding: 'utf-8' })
    } catch {
      return `No processes found matching ${filter}`
    }
  }
}
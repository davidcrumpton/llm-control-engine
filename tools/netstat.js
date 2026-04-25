export default {
  name: 'netstat',
  description: 'Get network connections',
  version: 'v1.0.0',
  tags: ['network', 'os'],
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
      return execSync(`netstat -f | grep ${filter}`, { encoding: 'utf-8' })
    } catch {
      return `No network connections found matching ${filter}`
    }
  }
}
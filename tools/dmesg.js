export default {
  name: 'dmesg',
  description: 'Get kernel ring buffer',
  version: 'v1.0.0',
  tags: ['os', 'system'],
  parameters: {
    type: 'object',
    properties: {
      filter: { type: 'string' }
    },
  },
  run: async ({ filter }) => {
    const { execSync } = await import('child_process')
    try {
      if (!filter) {
        return execSync(`dmesg`, { encoding: 'utf-8' })
      } else {
        return execSync(`dmesg | grep ${filter}`, { encoding: 'utf-8' })
      }
    } catch {
      return `No kernel ring buffer found`
    }
  }
}
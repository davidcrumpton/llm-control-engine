export default {
  name: 'uptime',
  description: 'Get system uptime',
  version: 'v1.0.0',
  tags: ['os', 'system'],
  parameters: { type: 'object', properties: {} },
  run: async () => {
    const { execSync } = await import('child_process')
    return execSync('uptime').toString()
  }
}
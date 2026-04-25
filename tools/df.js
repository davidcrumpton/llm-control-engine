export default {
  name: 'df',
  description: 'Get disk usage (df -h)',
  version: 'v1.0.0',
  parameters: {
    type: 'object',
    properties: {},
  },
  run: async () => {
    const { execSync } = await import('child_process')
    return execSync('df -h').toString()
  }
}

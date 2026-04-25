export default {
  name: 'git',
  description: 'Get git repo info',
  version: 'v1.0.0',
  tags: ['git', 'code'],
  parameters: {
    type: 'object',
    properties: {
      repo: { type: 'string' }
    },
    required: ['repo']
  },
  run: async ({ repo }) => {
    const { execSync } = await import('child_process')
    try {
      return execSync(`git log -n 1`, { encoding: 'utf-8' })
    } catch {
      return `No git repo found`
        }
  }
}
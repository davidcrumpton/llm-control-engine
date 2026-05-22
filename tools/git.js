import { execSync } from 'child_process'

export default {
  name: 'git',
  description: 'Get git repo info',
  version: 'v1.0.1',
  tags: ['git', 'code'],
  parameters: {
    type: 'object',
    properties: {
      repo: { type: 'string' }
    },
    required: ['repo']
  },
  run: async ({ repo }) => {
    try {
      return execSync(`git log -n 1`, { encoding: 'utf-8' })
    } catch {
      return `No git repo found`
        }
  }
}
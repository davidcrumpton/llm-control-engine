import { execSync } from 'child_process'

export default {
  name: 'netstat',
  description: 'Get network connections',
  version: 'v1.0.1',
  tags: ['network', 'os'],
  parameters: {
    type: 'object',
    properties: {
      filter: { type: 'string' }
    },
    required: ['filter']
  },
  run: async ({ filter }) => {
    try {
      return execSync(`netstat -f | grep ${filter}`, { encoding: 'utf-8' })
    } catch {
      return `No network connections found matching ${filter}`
    }
  }
}
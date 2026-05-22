import { execSync } from 'child_process'

export default {
  name: 'whatis',
  description: 'Get a short description of a command',
  version: 'v1.0.1',
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
    try {
      return execSync(`whatis ${command}`, { encoding: 'utf-8' })
    } catch {
      return `No whatis entry for ${command}`
    }
  }
}
import { execSync } from 'child_process'

export default {
  name: 'uptime',
  description: 'Get system uptime',
  version: 'v1.0.1',
  tags: ['os', 'system'],
  parameters: { type: 'object', properties: {} },
  run: async () => {
    return execSync('uptime').toString()
  }
}
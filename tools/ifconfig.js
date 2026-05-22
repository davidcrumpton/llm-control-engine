import { execSync } from 'child_process'

export default {
  name: 'ifconfig',
  description: 'Get network interfaces',
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
      return execSync(`ifconfig ${filter}`, { encoding: 'utf-8' })
    } catch {
      return `No network interfaces found matching ${filter}`
    }
  }
}
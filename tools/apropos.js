import { execSync } from 'child_process'

export default {
  name: 'apropos',
  description: 'Search man page descriptions by keyword',
  version: 'v1.0.1',
  tags: ['os', 'system'],
  policies: { maxCalls: 3 },
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' }
    },
    required: ['query']
  },
  run: async ({ query }) => {
    try {
      return execSync(`apropos ${query}`, { encoding: 'utf-8' })
    } catch {
      return `No results for ${query}`
    }
  }
}
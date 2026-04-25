export default {
  name: 'apropos',
  description: 'Search man page descriptions by keyword',
  version: 'v1.0.0',
  tags: ['os', 'system'],
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' }
    },
    required: ['query']
  },
  run: async ({ query }) => {
    const { execSync } = await import('child_process')
    try {
      return execSync(`apropos ${query}`, { encoding: 'utf-8' })
    } catch {
      return `No results for ${query}`
    }
  }
}
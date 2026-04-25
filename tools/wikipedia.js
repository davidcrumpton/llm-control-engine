export default {
  name: 'wikipedia_summary',
  description: 'Get a summary of a topic from Wikipedia',
  version: 'v1.0.0',
  tags: ['always', 'web'],
  parameters: {
    type: 'object',
    properties: {
      query: { type: 'string' }
    },
    required: ['query']
  },
  run: async ({ query }) => {
    const title = encodeURIComponent(query)
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${title}`

    const res = await fetch(url)
    if (!res.ok) {
      return `No Wikipedia page found for "${query}"`
    }

    const data = await res.json()
    return data.extract
  }
}

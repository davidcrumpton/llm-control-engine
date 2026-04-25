export default {
  name: 'http_get',
  description: 'Fetch a URL',
  version: 'v1.0.0',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string' }
    },
    required: ['url']
  },
  run: async ({ url }) => {
    const res = await fetch(url)
    return await res.text()
  }
}
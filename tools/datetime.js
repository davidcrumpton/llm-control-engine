export default {
  name: 'datetime',
  description: 'use this tool to get the current date and time',
  version: 'v1.0.0',
  parameters: {
    type: 'object',
    properties: {},
  },
  run: async () => {
    return new Date().toISOString()
  }
}
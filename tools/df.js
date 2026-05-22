import { execSync } from 'child_process'

export default {
  name: 'df',
  description: 'Get disk usage (df -h)',
  version: 'v1.0.1',
  tags: ['os', 'system'],
  parameters: {
    type: 'object',
    properties: {},
  },
  run: async () => {
    return execSync('df -h').toString()
  }
}

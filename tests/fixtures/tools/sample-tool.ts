/// tests/fixtures/tools/sample-tool.ts
// A valid tool module used by the dynamic tool loader tests
import type { ToolDefinition } from '@/core/types';

const sampleTool: ToolDefinition = {
  name: 'sample-tool',
  description: 'A sample tool for testing the dynamic loader',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query',
      },
      limit: {
        type: 'number',
        description: 'Max results',
        default: 10,
      },
    },
    required: ['query'],
  },
  execute: async (params: { query: string; limit?: number }) => {
    return {
      results: [`result for "${params.query}"`],
      total: 1,
    };
  },
};

export default sampleTool;
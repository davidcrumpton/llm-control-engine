/// tests/fixtures/tools/sample-tool.ts
// A valid tool module used by the dynamic tool loader tests
import type { ToolPlugin } from "../../../src/types.js";

const sampleTool: ToolPlugin = {
  type: "tool",
  name: "sample-tool",
  description: "A sample tool for testing the dynamic loader",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query",
      },
      limit: {
        type: "number",
        description: "Max results",
        default: 10,
      },
    },
    required: ["query"],
  },
  run: async (params: Record<string, unknown>) => {
    const query = params.query as string;
    return JSON.stringify({
      results: [`result for "${query}"`],
      total: 1,
    });
  },
};

export default sampleTool;

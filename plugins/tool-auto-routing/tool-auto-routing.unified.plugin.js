// plugins/tool-auto-routing/tool-auto-routing.unified.plugin.js
const DEFAULT_ROUTING_RULES = {
  search: {
    keywords: ['search', 'find', 'lookup', 'query'],
    tool: 'web-search',
    instruction: 'Use the web-search tool to find information about: ',
  },
  'run-code': {
    keywords: ['run code', 'execute', 'run this code', 'test code'],
    tool: 'code-runner',
    instruction: 'Use the code-runner tool to execute: ',
  },
  summarize: {
    keywords: ['summarize', 'summary', 'summarize this url', 'summarize this page'],
    tool: 'url-fetcher',
    instruction: 'Use the url-fetcher tool to get content and summarize: ',
  },
};

export default {
  type: 'hook',
  name: 'tool-auto-routing',
  version: 'v1.0.0',
  description: 'Unified plugin version: automatically routes prompts to appropriate tools based on keywords.',
  tags: ['routing', 'tools', 'automation'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      routingRules: {
        type: 'object',
        default: DEFAULT_ROUTING_RULES,
      },
    },
  },

  async run({ event, data, parameters }) {
    if (event !== 'inference:pre' || !parameters.enabled) return {};

    const { prompt } = data;

    // Check for routing triggers
    for (const [action, rule] of Object.entries(parameters.routingRules)) {
      const matches = rule.keywords.some(keyword =>
        prompt.toLowerCase().includes(keyword.toLowerCase())
      );

      if (matches) {
        // Rewrite prompt to explicitly request tool usage
        const enhancedPrompt = `${rule.instruction}${prompt}`;
        return {
          outcome: 'routed',
          data: {
            ...data,
            prompt: enhancedPrompt,
            routedToTool: rule.tool,
          },
        };
      }
    }

    return {};
  },
};
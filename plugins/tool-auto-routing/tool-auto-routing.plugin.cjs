// plugins/tool-auto-routing/tool-auto-routing.unified.plugin.cjs
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

module.exports = {
  type: 'hook',
  name: 'tool-auto-routing',
  version: '1.1.0',
  description: 'Unified plugin version: automatically routes prompts to appropriate tools.',
  tags: ['routing', 'tools', 'automation'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      routingRules: { type: 'object', default: DEFAULT_ROUTING_RULES },
    },
  },

  async run({ event, data, parameters }) {
    if (event !== 'inference:pre' || !parameters.enabled) return {};

    const { prompt } = data;

    for (const rule of Object.values(parameters.routingRules)) {
      if (rule.keywords.some(k => prompt.toLowerCase().includes(k))) {
        return {
          outcome: 'routed',
          data: {
            ...data,
            prompt: `${rule.instruction}${prompt}`,
            routedToTool: rule.tool,
          },
        };
      }
    }

    return {};
  },
};

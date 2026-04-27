// plugins/tool-auto-routing/tool-auto-routing.plugin.js
import { HookPriority } from 'llmctrlx/plugin-api/hooks';

const ROUTING_RULES = {
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
  meta: {
    name: 'tool-auto-routing',
    version: '1.0.0',
    description: 'Intercepts prompts and routes to appropriate tools based on content.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    tap(
      'inference:pre',
      async (ctx) => {
        const { prompt } = ctx.data;

        // Check for routing triggers
        for (const [action, rule] of Object.entries(ROUTING_RULES)) {
          const matches = rule.keywords.some(keyword =>
            prompt.toLowerCase().includes(keyword.toLowerCase())
          );

          if (matches) {
            // Rewrite prompt to explicitly request tool usage
            const enhancedPrompt = `${rule.instruction}${prompt}`;
            return {
              data: {
                ...ctx.data,
                prompt: enhancedPrompt,
                routedToTool: rule.tool,
              }
            };
          }
        }

        return {};
      },
      HookPriority.NORMAL
    );
  },
};
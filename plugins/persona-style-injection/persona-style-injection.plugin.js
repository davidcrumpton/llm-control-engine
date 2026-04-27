// plugins/persona-style-injection/persona-style-injection.plugin.js
import { HookPriority } from 'llmctrlx/plugin-api/hooks';

const DEFAULT_PERSONAS = {
  'senior-sre': 'Respond as a senior SRE explaining calmly at 3 AM, using technical but accessible language.',
  'noir-detective': 'Respond in the voice of a noir detective from a 1940s film noir movie.',
  'minimal-tech': 'Respond in clean, minimal technical English with no unnecessary words.',
};

export default {
  meta: {
    name: 'persona-style-injection',
    version: '1.0.0',
    description: 'Automatically rewrites prompts to enforce a persona, tone, or writing style.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    tap(
      'prompt:pre-process',
      async (ctx) => {
        const { prompt } = ctx.data;

        // Check for persona hints in the prompt
        let persona = null;
        for (const [key, instruction] of Object.entries(DEFAULT_PERSONAS)) {
          if (prompt.toLowerCase().includes(key.replace('-', ' ')) ||
              prompt.toLowerCase().includes(`as ${key}`) ||
              prompt.toLowerCase().includes(`like ${key}`)) {
            persona = instruction;
            break;
          }
        }

        // Check for custom persona instructions
        const customMatch = prompt.match(/respond as (.+?)[.!?]/i) ||
                           prompt.match(/write in the voice of (.+?)[.!?]/i) ||
                           prompt.match(/sound like (.+?)[.!?]/i);
        if (customMatch) {
          persona = `Respond in the voice of ${customMatch[1]}.`;
        }

        if (persona) {
          const enhancedPrompt = `${persona}\n\n${prompt}`;
          return { data: { ...ctx.data, prompt: enhancedPrompt } };
        }

        return {};
      },
      HookPriority.NORMAL
    );
  },
};
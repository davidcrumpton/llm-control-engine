// plugins/persona-style-injection/persona-style-injection.unified.plugin.js
const DEFAULT_PERSONAS = {
  'senior-sre': 'Respond as a senior SRE explaining calmly at 3 AM, using technical but accessible language.',
  'noir-detective': 'Respond in the voice of a noir detective from a 1940s film noir movie.',
  'minimal-tech': 'Respond in clean, minimal technical English with no unnecessary words.',
};

export default {
  type: 'hook',
  name: 'persona-style-injection',
  version: 'v1.0.0',
  description: 'Unified plugin version: enforces persona, tone, or writing style in prompts.',
  tags: ['persona', 'style', 'prompt-modification'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      customPersonas: {
        type: 'object',
        additionalProperties: { type: 'string' },
        default: {},
      },
    },
  },

  async run({ event, data, parameters }) {
    if (event !== 'prompt:pre-process' || !parameters.enabled) return {};

    const { prompt } = data;

    // Merge default and custom personas
    const personas = { ...DEFAULT_PERSONAS, ...parameters.customPersonas };

    // Check for persona hints in the prompt
    let persona = null;
    for (const [key, instruction] of Object.entries(personas)) {
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
      return {
        outcome: 'modified',
        data: { ...data, prompt: enhancedPrompt },
      };
    }

    return {};
  },
};
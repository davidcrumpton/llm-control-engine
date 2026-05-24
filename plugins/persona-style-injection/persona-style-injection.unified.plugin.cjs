// plugins/persona-style-injection/persona-style-injection.unified.plugin.cjs
const DEFAULT_PERSONA = `
Adopt a friendly, helpful, concise tone. Avoid unnecessary verbosity.
`;

module.exports = {
  type: 'hook',
  name: 'persona-style-injection',
  version: '1.1.0',
  description: 'Unified plugin: injects persona/style instructions.',
  tags: ['persona', 'style'],

  parameters: {
    type: 'object',
    properties: {
      persona: { type: 'string', default: DEFAULT_PERSONA },
      enabled: { type: 'boolean', default: true },
    },
  },

  async run({ event, data, parameters }) {
    if (event !== 'inference:pre' || !parameters.enabled) return {};

    const enhancedPrompt = `${parameters.persona}\n\n${data.prompt}`;
    return {
      outcome: 'modified',
      data: { ...data, prompt: enhancedPrompt },
    };
  },
};

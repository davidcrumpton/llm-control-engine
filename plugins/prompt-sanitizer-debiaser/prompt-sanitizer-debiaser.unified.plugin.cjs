// plugins/prompt-sanitizer-debiaser/prompt-sanitizer-debiaser.unified.plugin.cjs
function sanitize(prompt) {
  return prompt.replace(/(offensive|biased|harmful)/gi, '[filtered]');
}

module.exports = {
  type: 'hook',
  name: 'prompt-sanitizer-debiaser',
  version: '1.1.0',
  description: 'Unified plugin: sanitizes and debiases prompts.',
  tags: ['sanitizer', 'safety'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
    },
  },

  async run({ event, data, parameters }) {
    if (event !== 'inference:pre' || !parameters.enabled) return {};
    return {
      outcome: 'modified',
      data: { ...data, prompt: sanitize(data.prompt) },
    };
  },
};

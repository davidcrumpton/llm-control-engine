// plugins/prompt-sanitizer-debiaser/prompt-sanitizer-debiaser.plugin.cjs

function sanitize(prompt) {
  return prompt.replace(/(offensive|biased|harmful)/gi, '[filtered]');
}

module.exports = {
  meta: {
    name: 'prompt-sanitizer-debiaser',
    version: '1.1.0',
    description: 'Sanitizes and debiases prompts.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    tap(
      'inference:pre',
      async (ctx) => {
        const cleaned = sanitize(ctx.data.prompt);
        return { data: { ...ctx.data, prompt: cleaned } };
      },
      500
    );
  },
};

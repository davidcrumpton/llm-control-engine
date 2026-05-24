// plugins/prompt-guard.plugin.js


module.exports = {
  meta: {
    name: 'prompt-guard',
    version: '1.1.0',
    description: 'Blocks unsafe or disallowed prompts.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    tap(
      'inference:pre',
      async (ctx) => {
        const p = ctx.data.prompt.toLowerCase();

        if (p.includes('illegal') || p.includes('harmful action')) {
          return {
            data: {
              ...ctx.data,
              prompt: 'The user attempted to request disallowed content. Respond safely.',
            }
          };
        }

        return {};
      },
      500
    );
  },
};

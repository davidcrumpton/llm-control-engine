// plugins/persona-style-injection/persona-style-injection.plugin.cjs

const DEFAULT_PERSONA = `
Adopt a friendly, helpful, concise tone. Avoid unnecessary verbosity.
`;

module.exports = {
  meta: {
    name: 'persona-style-injection',
    version: '1.1.0',
    description: 'Injects persona/style instructions into prompts.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    tap(
      'inference:pre',
      async (ctx) => {
        const persona = ctx.data.persona || DEFAULT_PERSONA;
        const enhancedPrompt = `${persona}\n\n${ctx.data.prompt}`;
        return { data: { ...ctx.data, prompt: enhancedPrompt } };
      },
      500
    );
  },
};

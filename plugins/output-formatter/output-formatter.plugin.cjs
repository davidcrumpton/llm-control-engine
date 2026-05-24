// plugins/output-formatter/output-formatter.plugin.cjs
// const { HookPriority } = require('llmctrlx/plugin-api/hooks');
const { detectFormat, applyFormat } = require('./utils.cjs'); // Ensure utils is also .cjs

module.exports = {
  meta: {
    name: 'output-formatter',
    version: '1.1.0',
    description: 'Transforms model output into Markdown, JSON, YAML, tables, or minimal text.',
    author: 'LLM Control Engine',
  },


install(tap) {
    tap(
      'response:filter',
      async (ctx) => {
        const raw = ctx.data.output;
        const format = detectFormat(ctx);
        if (!format) return {};
        const formatted = await applyFormat(format, raw);
        return { data: { output: formatted } };
      }
    );
  },
};

// plugins/output-formatter/output-formatter.plugin.js
import { HookPriority } from 'llmctrlx/plugin-api/hooks';
import { detectFormat, applyFormat } from './utils.js';

export default {
  meta: {
    name: 'output-formatter',
    version: '1.0.1',
    description: 'Transforms model output into Markdown, JSON, YAML, tables, or minimal text.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    tap(
      'response:filter',
      async (ctx) => {
        const raw = ctx.data.output;

        // 1. Detect desired format (CLI flags, env vars, prompt hints)
        const format = detectFormat(ctx);
        if (!format) return {};

        // 2. Apply formatting
        const formatted = await applyFormat(format, raw);

        return { data: { output: formatted } };
      },
      HookPriority.NORMAL
    );
  },
};

// plugins/knowledge-pack-loader/knowledge-pack-loader.plugin.cjs

const fs = require('fs');
const path = require('path');

module.exports = {
  meta: {
    name: 'knowledge-pack-loader',
    version: '1.1.0',
    description: 'Loads external knowledge packs into context.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    tap(
      'inference:pre',
      async (ctx) => {
        const packs = ctx.data.knowledgePacks || [];
        const loaded = [];

        for (const pack of packs) {
          const file = path.resolve(process.cwd(), pack);
          if (fs.existsSync(file)) {
            loaded.push(fs.readFileSync(file, 'utf8'));
          }
        }

        return { data: { ...ctx.data, knowledge: loaded } };
      },
      500
    );
  },
};

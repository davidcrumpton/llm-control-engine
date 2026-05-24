// plugins/knowledge-pack-loader/knowledge-pack-loader.unified.plugin.cjs
const fs = require('fs');
const path = require('path');

module.exports = {
  type: 'hook',
  name: 'knowledge-pack-loader',
  version: '1.1.0',
  description: 'Unified plugin: loads external knowledge packs.',
  tags: ['knowledge', 'context'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      packs: { type: 'array', items: { type: 'string' }, default: [] },
    },
  },

  async run({ event, data, parameters }) {
    if (event !== 'inference:pre' || !parameters.enabled) return {};

    const loaded = [];
    for (const pack of parameters.packs) {
      const file = path.resolve(process.cwd(), pack);
      if (fs.existsSync(file)) {
        loaded.push(fs.readFileSync(file, 'utf8'));
      }
    }

    return {
      outcome: 'modified',
      data: { ...data, knowledge: loaded },
    };
  },
};

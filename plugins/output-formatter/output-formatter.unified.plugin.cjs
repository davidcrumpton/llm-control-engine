// plugins/output-formatter/output-formatter.unified.plugin.cjs
const { detectFormat, applyFormat } = require('./utils.cjs');

module.exports = {
  type: 'hook',
  name: 'output-formatter',
  version: '1.1.0',
  description: 'Unified plugin version: formats model output into JSON, YAML, Markdown, tables, or minimal text.',
  tags: ['formatting', 'output', 'cli'],

  parameters: {
    type: 'object',
    properties: {
      defaultFormat: {
        type: 'string',
        enum: ['json', 'yaml', 'markdown', 'table', 'minimal', 'none'],
        default: 'none',
      },
    },
  },

  async run({ event, data, parameters }) {
    if (event !== 'response:filter') return {};

    const raw = data.content;
    const format = detectFormat({ data }) || parameters.defaultFormat;
    
    if (!format || format === 'none') return {};

    const formatted = await applyFormat(format, raw);

    return {
      outcome: 'modified',
      data: { content: formatted },
    };
  },
};

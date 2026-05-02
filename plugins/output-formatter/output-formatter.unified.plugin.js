// plugins/output-formatter/output-formatter.unified.js
import { detectFormat, applyFormat } from './utils.js';

export default {
  type: 'hook',
  name: 'output-formatter',
  version: 'v1.0.1',
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

    // 1. Detect format from context or plugin parameters
    const format = detectFormat({ data }) || parameters.defaultFormat;
    if (!format || format === 'none') return {};

    // 2. Apply formatting
    const formatted = await applyFormat(format, raw);

    return {
      outcome: 'modified',
      data: { content: formatted },
    };
  },
};

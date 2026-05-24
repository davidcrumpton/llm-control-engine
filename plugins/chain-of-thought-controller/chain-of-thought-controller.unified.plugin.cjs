// plugins/chain-of-thought-controller/chain-of-thought-controller.unified.plugin.cjs
const DEFAULT_COT_MODES = {
  hidden: 'Use step-by-step reasoning internally but hide it from the final answer.',
  visible: 'Show your step-by-step reasoning process in the response.',
  suppressed: 'Do not use any step-by-step reasoning. Answer directly.',
  structured: 'Use a structured reasoning format with clear steps and conclusions.',
};

module.exports = {
  type: 'hook',
  name: 'chain-of-thought-controller',
  version: 'v1.0.0',
  description: 'Unified plugin version: controls CoT behavior.',
  tags: ['reasoning', 'cot', 'thinking'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      defaultMode: {
        type: 'string',
        enum: ['hidden', 'visible', 'suppressed', 'structured'],
        default: 'hidden',
      },
      customInstructions: {
        type: 'object',
        additionalProperties: { type: 'string' },
        default: {},
      },
    },
  },

  async run({ event, data, parameters }) {
    if (!parameters.enabled) return {};

    if (event === 'inference:pre') {
      const { prompt } = data;
      let cotMode = parameters.defaultMode;
      const p = prompt.toLowerCase();

      if (p.includes('show your work') || p.includes('explain step by step') || p.includes('visible reasoning'))
        cotMode = 'visible';
      else if (p.includes('answer directly') || p.includes('no explanation') || p.includes('suppress reasoning'))
        cotMode = 'suppressed';
      else if (p.includes('structured reasoning') || p.includes('json reasoning') || p.includes('step by step format'))
        cotMode = 'structured';

      const instructions = { ...DEFAULT_COT_MODES, ...parameters.customInstructions };
      const enhancedPrompt = `${instructions[cotMode]}\n\n${prompt}`;

      return {
        outcome: 'modified',
        data: { ...data, prompt: enhancedPrompt, cotMode },
      };
    }

    if (event === 'response:filter') {
      const { content, cotMode } = data;

      if (!cotMode || cotMode === 'visible' || cotMode === 'suppressed') return {};

      if (cotMode === 'hidden') {
        const lines = content.split('\n');
        const finalAnswer = lines.find(l =>
          l.toLowerCase().includes('final answer') ||
          l.toLowerCase().includes('conclusion') ||
          /^\s*\d+\./.test(l)
        );
        if (finalAnswer) {
          return {
            outcome: 'filtered',
            data: { ...data, content: finalAnswer.trim() },
          };
        }
      }

      if (cotMode === 'structured') {
        if (!content.includes('Step 1:') && !content.includes('Conclusion:')) {
          return {
            outcome: 'structured',
            data: {
              ...data,
              content: `Step-by-step reasoning:\n${content}\n\nConclusion: [Final answer extracted above]`,
            },
          };
        }
      }

      return {};
    }

    return {};
  },
};

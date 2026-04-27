// plugins/chain-of-thought-controller/chain-of-thought-controller.unified.plugin.js
const DEFAULT_COT_MODES = {
  hidden: 'Use step-by-step reasoning internally but hide it from the final answer.',
  visible: 'Show your step-by-step reasoning process in the response.',
  suppressed: 'Do not use any step-by-step reasoning. Answer directly.',
  structured: 'Use a structured reasoning format with clear steps and conclusions.',
};

export default {
  type: 'hook',
  name: 'chain-of-thought-controller',
  version: 'v1.0.0',
  description: 'Unified plugin version: controls CoT behavior (hidden, visible, suppressed, structured).',
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

      // Detect CoT preferences from prompt
      if (prompt.toLowerCase().includes('show your work') ||
          prompt.toLowerCase().includes('explain step by step') ||
          prompt.toLowerCase().includes('visible reasoning')) {
        cotMode = 'visible';
      } else if (prompt.toLowerCase().includes('answer directly') ||
                 prompt.toLowerCase().includes('no explanation') ||
                 prompt.toLowerCase().includes('suppress reasoning')) {
        cotMode = 'suppressed';
      } else if (prompt.toLowerCase().includes('structured reasoning') ||
                 prompt.toLowerCase().includes('json reasoning') ||
                 prompt.toLowerCase().includes('step by step format')) {
        cotMode = 'structured';
      }

      const instructions = { ...DEFAULT_COT_MODES, ...parameters.customInstructions };
      const cotInstruction = instructions[cotMode] || instructions.hidden;
      const enhancedPrompt = `${cotInstruction}\n\n${prompt}`;

      return {
        outcome: 'modified',
        data: { ...data, prompt: enhancedPrompt, cotMode },
      };

    } else if (event === 'response:filter') {
      const { content, cotMode } = data;

      if (!cotMode || cotMode === 'visible' || cotMode === 'suppressed') {
        return {}; // No filtering needed
      }

      if (cotMode === 'hidden') {
        // Try to hide reasoning traces (very basic implementation)
        const lines = content.split('\n');
        const finalAnswer = lines.find(line =>
          line.toLowerCase().includes('final answer') ||
          line.toLowerCase().includes('conclusion') ||
          line.match(/^\s*\d+\./) // Numbered conclusions
        );

        if (finalAnswer) {
          return {
            outcome: 'filtered',
            data: { ...data, content: finalAnswer.trim() },
          };
        }
      }

      if (cotMode === 'structured') {
        // Ensure structured format
        if (!content.includes('Step 1:') && !content.includes('Conclusion:')) {
          const structured = `Step-by-step reasoning:\n${content}\n\nConclusion: [Final answer extracted above]`;
          return {
            outcome: 'structured',
            data: { ...data, content: structured },
          };
        }
      }

      return {};
    }

    return {};
  },
};
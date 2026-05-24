// plugins/chain-of-thought-controller/chain-of-thought-controller.plugin.cjs

const COT_MODES = {
  hidden: 'Use step-by-step reasoning internally but hide it from the final answer.',
  visible: 'Show your step-by-step reasoning process in the response.',
  suppressed: 'Do not use any step-by-step reasoning. Answer directly.',
  structured: 'Use a structured reasoning format with clear steps and conclusions.',
};

module.exports = {
  meta: {
    name: 'chain-of-thought-controller',
    version: '1.1.0',
    description: 'Controls whether the model uses hidden, visible, suppressed, or structured reasoning.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    tap(
      'inference:pre',
      async (ctx) => {
        const { prompt } = ctx.data;

        let cotMode = 'hidden';

        const p = prompt.toLowerCase();
        if (p.includes('show your work') || p.includes('explain step by step') || p.includes('visible reasoning'))
          cotMode = 'visible';
        else if (p.includes('answer directly') || p.includes('no explanation') || p.includes('suppress reasoning'))
          cotMode = 'suppressed';
        else if (p.includes('structured reasoning') || p.includes('json reasoning') || p.includes('step by step format'))
          cotMode = 'structured';

        return {
          data: {
            ...ctx.data,
            prompt: `${COT_MODES[cotMode]}\n\n${prompt}`,
            cotMode,
          }
        };
      },
      500
    );

    tap(
      'response:filter',
      async (ctx) => {
        const { output, cotMode } = ctx.data;

        if (!cotMode || cotMode === 'visible' || cotMode === 'suppressed') return {};

        if (cotMode === 'hidden') {
          const lines = output.split('\n');
          const finalAnswer = lines.find(l =>
            l.toLowerCase().includes('final answer') ||
            l.toLowerCase().includes('conclusion') ||
            /^\s*\d+\./.test(l)
          );
          if (finalAnswer) {
            return { data: { ...ctx.data, output: finalAnswer.trim() } };
          }
        }

        if (cotMode === 'structured') {
          if (!output.includes('Step 1:') && !output.includes('Conclusion:')) {
            return {
              data: {
                ...ctx.data,
                output: `Step-by-step reasoning:\n${output}\n\nConclusion: [Final answer extracted above]`,
              }
            };
          }
        }

        return {};
      },
      500
    );
  },
};

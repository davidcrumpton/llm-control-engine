// plugins/chain-of-thought-controller/chain-of-thought-controller.plugin.js
import { HookPriority } from 'llmctrlx/plugin-api/hooks';

const COT_MODES = {
  hidden: 'Use step-by-step reasoning internally but hide it from the final answer.',
  visible: 'Show your step-by-step reasoning process in the response.',
  suppressed: 'Do not use any step-by-step reasoning. Answer directly.',
  structured: 'Use a structured reasoning format with clear steps and conclusions.',
};

export default {
  meta: {
    name: 'chain-of-thought-controller',
    version: '1.0.0',
    description: 'Controls whether the model uses hidden, visible, suppressed, or structured reasoning.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    // Modify prompt to include CoT instructions
    tap(
      'inference:pre',
      async (ctx) => {
        const { prompt } = ctx.data;

        let cotMode = 'hidden'; // default

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

        const cotInstruction = COT_MODES[cotMode];
        const enhancedPrompt = `${cotInstruction}\n\n${prompt}`;

        return { data: { ...ctx.data, prompt: enhancedPrompt, cotMode } };
      },
      HookPriority.NORMAL
    );

    // Process response based on CoT mode
    tap(
      'response:filter',
      async (ctx) => {
        const { output, cotMode } = ctx.data;

        if (!cotMode || cotMode === 'visible' || cotMode === 'suppressed') {
          return {}; // No filtering needed
        }

        if (cotMode === 'hidden') {
          // Try to hide reasoning traces (very basic implementation)
          const lines = output.split('\n');
          const finalAnswer = lines.find(line =>
            line.toLowerCase().includes('final answer') ||
            line.toLowerCase().includes('conclusion') ||
            line.match(/^\s*\d+\./) // Numbered conclusions
          );

          if (finalAnswer) {
            return { data: { ...ctx.data, output: finalAnswer.trim() } };
          }
        }

        if (cotMode === 'structured') {
          // Ensure structured format
          if (!output.includes('Step 1:') && !output.includes('Conclusion:')) {
            const structured = `Step-by-step reasoning:\n${output}\n\nConclusion: [Final answer extracted above]`;
            return { data: { ...ctx.data, output: structured } };
          }
        }

        return {};
      },
      HookPriority.NORMAL
    );
  },
};
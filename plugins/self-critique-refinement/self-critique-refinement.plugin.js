// plugins/self-critique-refinement/self-critique-refinement.plugin.js
import { HookPriority } from 'llmctrlx/plugin-api/hooks';

export default {
  meta: {
    name: 'self-critique-refinement',
    version: '1.0.0',
    description: 'After generating an answer, critiques and optionally refines the output.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    tap(
      'inference:post',
      async (ctx) => {
        const { output } = ctx.data;

        // Simulate self-critique (in real implementation, this would call the model again)
        const critique = generateSelfCritique(output);

        // Optionally refine the output
        const refined = shouldRefine(output) ? applyRefinement(output) : output;

        const enhancedOutput = `${refined}\n\n---\n**Self-Critique:** ${critique}`;

        return { data: { ...ctx.data, output: enhancedOutput } };
      },
      HookPriority.NORMAL
    );
  },
};

// Helper functions for simulation
function generateSelfCritique(output) {
  const critiques = [
    "This response is comprehensive but could be more concise.",
    "The explanation is clear, though some technical terms might need definition.",
    "Good structure, but could benefit from examples.",
    "Accurate information, but the conclusion could be stronger.",
    "Well-reasoned, but considers adding alternative perspectives.",
  ];

  // Simple selection based on output length
  const index = Math.min(output.length / 100, critiques.length - 1);
  return critiques[Math.floor(index)];
}

function shouldRefine(output) {
  // Simulate decision to refine - refine if output is very short or has common issues
  return output.length < 50 || output.includes('TODO') || output.includes('FIXME');
}

function applyRefinement(output) {
  // Simple refinements
  let refined = output;

  if (output.length < 50) {
    refined = `${output}\n\n(This response has been enhanced for completeness.)`;
  }

  refined = refined.replace(/TODO/gi, '[Action Item]');
  refined = refined.replace(/FIXME/gi, '[Needs Attention]');

  return refined;
}
// plugins/self-critique-refinement/self-critique-refinement.unified.plugin.js
export default {
  type: 'hook',
  name: 'self-critique-refinement',
  version: 'v1.0.0',
  description: 'Unified plugin version: critiques and refines model outputs after generation.',
  tags: ['critique', 'refinement', 'quality'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      addCritique: { type: 'boolean', default: true },
      autoRefine: { type: 'boolean', default: false },
      critiqueStyle: {
        type: 'string',
        enum: ['constructive', 'brief', 'detailed'],
        default: 'constructive',
      },
    },
  },

  async run({ event, data, parameters }) {
    if (event !== 'inference:post' || !parameters.enabled) return {};

    const { content } = data;

    let enhancedContent = content;

    // Apply refinement if enabled
    if (parameters.autoRefine) {
      enhancedContent = applyRefinement(enhancedContent);
    }

    // Add self-critique if enabled
    if (parameters.addCritique) {
      const critique = generateSelfCritique(enhancedContent, parameters.critiqueStyle);
      enhancedContent = `${enhancedContent}\n\n---\n**Self-Critique:** ${critique}`;
    }

    return {
      outcome: 'refined',
      data: { ...data, content: enhancedContent },
    };
  },
};

// Helper functions for simulation
function generateSelfCritique(output, style) {
  const critiques = {
    constructive: [
      "This response is comprehensive but could be more concise.",
      "The explanation is clear, though some technical terms might need definition.",
      "Good structure, but could benefit from examples.",
      "Accurate information, but the conclusion could be stronger.",
      "Well-reasoned, but considers adding alternative perspectives.",
    ],
    brief: [
      "Good, but could be more concise.",
      "Clear, but add definitions for terms.",
      "Well structured, needs examples.",
      "Accurate, strengthen conclusion.",
      "Solid reasoning, consider alternatives.",
    ],
    detailed: [
      "This response demonstrates good understanding but would benefit from brevity while maintaining key points.",
      "The explanation is logically sound, however technical terminology should be defined for broader accessibility.",
      "Structure is appropriate, but practical examples would enhance comprehension.",
      "Information accuracy is high, but the concluding statements could be more decisive.",
      "Reasoning is sound, but including counterarguments would strengthen the overall analysis.",
    ],
  };

  const styleCritiques = critiques[style] || critiques.constructive;
  const index = Math.min(output.length / 100, styleCritiques.length - 1);
  return styleCritiques[Math.floor(index)];
}

function applyRefinement(output) {
  // Simple refinements
  let refined = output;

  if (output.length < 50) {
    refined = `${output}\n\n(This response has been enhanced for completeness.)`;
  }

  refined = refined.replace(/TODO/gi, '[Action Item]');
  refined = refined.replace(/FIXME/gi, '[Needs Attention]');
  refined = refined.replace(/\b(improve|fix|change)\b/gi, '**$1**'); // Highlight improvement suggestions

  return refined;
}
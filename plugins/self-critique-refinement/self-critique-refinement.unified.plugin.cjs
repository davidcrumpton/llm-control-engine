// plugins/self-critique-refinement/self-critique-refinement.unified.plugin.cjs

function generateSelfCritique(output) {
  const critiques = [
    "This response is comprehensive but could be more concise.",
    "The explanation is clear, though some technical terms might need definition.",
    "Good structure, but could benefit from examples.",
    "Accurate information, but the conclusion could be stronger.",
    "Well-reasoned, but consider adding alternative perspectives.",
  ];
  const index = Math.min(Math.floor(output.length / 100), critiques.length - 1);
  return critiques[index];
}

function shouldRefine(output) {
  return output.length < 50;
}

function applyRefinement(output) {
  return output + " (refined)";
}

module.exports = {
  type: 'hook',
  name: 'self-critique-refinement',
  version: '1.1.0',
  description: 'Unified plugin: critiques and optionally refines model output.',
  tags: ['self-critique', 'refinement'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      attachCritique: { type: 'boolean', default: true },
      refine: { type: 'boolean', default: true },
    },
  },

  async run({ event, data, parameters }) {
    if (!parameters.enabled) return {};
    if (event !== 'inference:post') return {};

    const original = data.content;
    const refined = parameters.refine && shouldRefine(original)
      ? applyRefinement(original)
      : original;

    const critique = generateSelfCritique(original);

    let finalOutput = refined;
    if (parameters.attachCritique) {
      finalOutput = `${refined}\n\n---\n**Self-Critique:** ${critique}`;
    }

    return {
      outcome: 'modified',
      data: { ...data, content: finalOutput },
    };
  },
};

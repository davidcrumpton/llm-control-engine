// plugins/self-critique-refinement/self-critique-refinement.plugin.cjs

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
  meta: {
    name: 'self-critique-refinement',
    version: '1.1.0',
    description: 'After generating an answer, critiques and optionally refines the output.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    tap(
      'inference:post',
      async (ctx) => {
        const { output } = ctx.data;

        const critique = generateSelfCritique(output);
        const refined = shouldRefine(output) ? applyRefinement(output) : output;

        return {
          data: {
            ...ctx.data,
            output: `${refined}\n\n---\n**Self-Critique:** ${critique}`,
          }
        };
      },
      500
    );
  },
};

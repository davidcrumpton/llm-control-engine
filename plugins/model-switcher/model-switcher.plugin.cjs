// plugins/model-switcher/model-switcher.plugin.cjs

const MODEL_PROFILES = {
  'deepseek-coder': {
    strengths: ['code', 'programming', 'debugging', 'technical'],
    contextWindow: 32768,
    cost: 'low',
    useCase: 'code generation and technical tasks',
  },
  'llama-3.1': {
    strengths: ['reasoning', 'analysis', 'general', 'writing'],
    contextWindow: 128000,
    cost: 'medium',
    useCase: 'general reasoning and analysis',
  },
  'mistral': {
    strengths: ['chat', 'conversation', 'creative', 'fast'],
    contextWindow: 32000,
    cost: 'low',
    useCase: 'conversational and creative tasks',
  },
  'claude-3': {
    strengths: ['analysis', 'long-form', 'research', 'complex'],
    contextWindow: 200000,
    cost: 'high',
    useCase: 'complex analysis and long-form content',
  },
};

function selectBestModel(prompt) {
  const lower = prompt.toLowerCase();
  const len = prompt.length;

  const code = ['code', 'function', 'class', 'debug', 'programming', 'javascript', 'python', 'git'];
  const analysis = ['analyze', 'explain', 'reason', 'why', 'how', 'compare', 'research'];
  const creative = ['write', 'story', 'creative', 'brainstorm', 'chat', 'conversation'];

  if (code.some(k => lower.includes(k))) return 'deepseek-coder';
  if (analysis.some(k => lower.includes(k)) && len > 1000) return 'claude-3';
  if (analysis.some(k => lower.includes(k))) return 'llama-3.1';
  if (creative.some(k => lower.includes(k))) return 'mistral';

  return 'llama-3.1';
}

module.exports = {
  meta: {
    name: 'model-switcher',
    version: '1.1.0',
    description: 'Chooses the best model based on prompt characteristics.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    tap(
      'inference:pre',
      async (ctx) => {
        const { prompt } = ctx.data;
        const recommendedModel = selectBestModel(prompt);
        const modelNote = `Recommended model: ${recommendedModel} (${MODEL_PROFILES[recommendedModel].useCase})`;

        return {
          data: {
            ...ctx.data,
            recommendedModel,
            modelNote,
          }
        };
      },
      500
    );
  },
};

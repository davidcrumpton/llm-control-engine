// plugins/model-switcher/model-switcher.unified.plugin.cjs
const DEFAULT_MODEL_PROFILES = {
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

function selectBestModel(prompt, parameters) {
  const lower = prompt.toLowerCase();
  const len = prompt.length;
  const profiles = parameters.modelProfiles;

  const code = ['code', 'function', 'class', 'debug', 'programming', 'javascript', 'python', 'git'];
  const analysis = ['analyze', 'explain', 'reason', 'why', 'how', 'compare', 'research'];
  const creative = ['write', 'story', 'creative', 'brainstorm', 'chat', 'conversation'];

  if (code.some(k => lower.includes(k)) && profiles['deepseek-coder']) return 'deepseek-coder';
  if (analysis.some(k => lower.includes(k)) && len > 1000 && profiles['claude-3']) return 'claude-3';
  if (analysis.some(k => lower.includes(k)) && profiles['llama-3.1']) return 'llama-3.1';
  if (creative.some(k => lower.includes(k)) && profiles['mistral']) return 'mistral';

  return parameters.defaultModel;
}

module.exports = {
  type: 'hook',
  name: 'model-switcher',
  version: '1.1.0',
  description: 'Unified plugin version: selects optimal model based on prompt analysis.',
  tags: ['model-selection', 'optimization', 'routing'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      modelProfiles: { type: 'object', default: DEFAULT_MODEL_PROFILES },
      defaultModel: { type: 'string', default: 'llama-3.1' },
      addModelNote: { type: 'boolean', default: true },
    },
  },

  async run({ event, data, parameters }) {
    if (event !== 'inference:pre' || !parameters.enabled) return {};

    const { prompt } = data;
    const recommendedModel = selectBestModel(prompt, parameters);

    const enhanced = { ...data, recommendedModel };

    if (parameters.addModelNote) {
      const profile = parameters.modelProfiles[recommendedModel];
      enhanced.modelNote = `Recommended model: ${recommendedModel} (${profile?.useCase || 'general purpose'})`;
    }

    return {
      outcome: 'routed',
      data: enhanced,
    };
  },
};

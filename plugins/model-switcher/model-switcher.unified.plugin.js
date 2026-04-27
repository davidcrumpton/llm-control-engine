// plugins/model-switcher/model-switcher.unified.plugin.js
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

export default {
  type: 'hook',
  name: 'model-switcher',
  version: 'v1.0.0',
  description: 'Unified plugin version: selects optimal model based on prompt analysis.',
  tags: ['model-selection', 'optimization', 'routing'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      modelProfiles: {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            strengths: { type: 'array', items: { type: 'string' } },
            contextWindow: { type: 'number' },
            cost: { type: 'string' },
            useCase: { type: 'string' },
          },
        },
        default: DEFAULT_MODEL_PROFILES,
      },
      defaultModel: { type: 'string', default: 'llama-3.1' },
      addModelNote: { type: 'boolean', default: true },
    },
  },

  async run({ event, data, parameters }) {
    if (event !== 'inference:pre' || !parameters.enabled) return {};

    const { prompt } = data;

    // Analyze prompt to determine best model
    const recommendedModel = selectBestModel(prompt, parameters);

    // Add model recommendation to context
    let enhancedData = { ...data, recommendedModel };

    if (parameters.addModelNote) {
      const profile = parameters.modelProfiles[recommendedModel];
      const modelNote = `Recommended model: ${recommendedModel} (${profile?.useCase || 'general purpose'})`;
      enhancedData.modelNote = modelNote;
    }

    return {
      outcome: 'routed',
      data: enhancedData,
    };
  },
};

// Helper function to select best model
function selectBestModel(prompt, parameters) {
  const lowerPrompt = prompt.toLowerCase();
  const promptLength = prompt.length;
  const profiles = parameters.modelProfiles;

  // Check for code-related keywords
  const codeKeywords = ['code', 'function', 'class', 'debug', 'programming', 'javascript', 'python', 'git'];
  const hasCodeKeywords = codeKeywords.some(keyword => lowerPrompt.includes(keyword));

  // Check for analysis/reasoning keywords
  const analysisKeywords = ['analyze', 'explain', 'reason', 'why', 'how', 'compare', 'research'];
  const hasAnalysisKeywords = analysisKeywords.some(keyword => lowerPrompt.includes(keyword));

  // Check for creative/chat keywords
  const creativeKeywords = ['write', 'story', 'creative', 'brainstorm', 'chat', 'conversation'];
  const hasCreativeKeywords = creativeKeywords.some(keyword => lowerPrompt.includes(keyword));

  // Model selection logic
  if (hasCodeKeywords && profiles['deepseek-coder']) {
    return 'deepseek-coder';
  }

  if (hasAnalysisKeywords && promptLength > 1000 && profiles['claude-3']) {
    return 'claude-3'; // Long analysis tasks
  }

  if (hasAnalysisKeywords && profiles['llama-3.1']) {
    return 'llama-3.1'; // General reasoning
  }

  if (hasCreativeKeywords && profiles['mistral']) {
    return 'mistral'; // Fast and creative
  }

  // Default fallback
  return parameters.defaultModel;
}
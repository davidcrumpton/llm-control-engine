// plugins/model-switcher/model-switcher.plugin.js
import { HookPriority } from 'llmctrlx/plugin-api/hooks';

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

export default {
  meta: {
    name: 'model-switcher',
    version: '1.0.0',
    description: 'Chooses the best model based on prompt characteristics.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    tap(
      'inference:pre',
      async (ctx) => {
        const { prompt } = ctx.data;

        // Analyze prompt to determine best model
        const recommendedModel = selectBestModel(prompt);

        // Add model recommendation to context
        // In a real implementation, this would actually switch the model
        const modelNote = `Recommended model: ${recommendedModel} (${MODEL_PROFILES[recommendedModel].useCase})`;

        return {
          data: {
            ...ctx.data,
            recommendedModel,
            modelNote,
          }
        };
      },
      HookPriority.HIGH
    );
  },
};

// Helper function to select best model
function selectBestModel(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const promptLength = prompt.length;

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
  if (hasCodeKeywords) {
    return 'deepseek-coder';
  }

  if (hasAnalysisKeywords && promptLength > 1000) {
    return 'claude-3'; // Long analysis tasks
  }

  if (hasAnalysisKeywords) {
    return 'llama-3.1'; // General reasoning
  }

  if (hasCreativeKeywords) {
    return 'mistral'; // Fast and creative
  }

  // Default fallback
  return 'llama-3.1';
}
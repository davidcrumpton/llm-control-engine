// plugins/memory-context-persistence/memory-context-persistence.unified.plugin.js
// Simple in-memory storage for demonstration
// In production, this would use persistent storage
const memoryStore = new Map();

export default {
  type: 'hook',
  name: 'memory-context-persistence',
  version: 'v1.0.0',
  description: 'Unified plugin version: stores facts from interactions and injects relevant context into prompts.',
  tags: ['memory', 'context', 'persistence'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      maxFactsPerResponse: { type: 'number', default: 5 },
      maxRelevantMemories: { type: 'number', default: 3 },
      minOverlapWords: { type: 'number', default: 2 },
    },
  },

  async run({ event, data, parameters }) {
    if (!parameters.enabled) return {};

    if (event === 'response:filter') {
      const { content, requestId } = data;

      // Extract and store facts from responses
      const facts = extractFacts(content, parameters.maxFactsPerResponse);
      if (facts.length > 0) {
        const existing = memoryStore.get(requestId) || [];
        memoryStore.set(requestId, [...existing, ...facts]);
      }

      return {};

    } else if (event === 'prompt:pre-process') {
      const { prompt, requestId } = data;

      // Get memories from this conversation
      const memories = memoryStore.get(requestId) || [];

      if (memories.length > 0) {
        const relevantMemories = findRelevantMemories(prompt, memories, parameters);
        if (relevantMemories.length > 0) {
          const memoryContext = `Previous context:\n${relevantMemories.map(fact => `- ${fact}`).join('\n')}\n\n`;
          const enhancedPrompt = memoryContext + prompt;
          return {
            outcome: 'modified',
            data: { ...data, prompt: enhancedPrompt },
          };
        }
      }

      return {};
    }

    return {};
  },
};

// Helper functions
function extractFacts(text, maxFacts = 5) {
  // Very simple fact extraction - look for sentences with "is", "are", "was", etc.
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const facts = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length > 0 && (
      /\b(is|are|was|were|has|have|had)\b/i.test(trimmed) ||
      /\b(fact|remember|note)\b/i.test(trimmed)
    )) {
      facts.push(trimmed);
    }
  }

  return facts.slice(0, maxFacts);
}

function findRelevantMemories(prompt, memories, parameters) {
  // Simple relevance check - if memory contains words from prompt
  const promptWords = prompt.toLowerCase().split(/\s+/);
  const relevant = [];

  for (const memory of memories) {
    const memoryWords = memory.toLowerCase().split(/\s+/);
    const overlap = promptWords.filter(word => memoryWords.includes(word)).length;
    if (overlap >= parameters.minOverlapWords) {
      relevant.push(memory);
    }
  }

  return relevant.slice(0, parameters.maxRelevantMemories);
}
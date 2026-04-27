// plugins/memory-context-persistence/memory-context-persistence.plugin.js
import { HookPriority } from 'llmctrlx/plugin-api/hooks';

// Simple in-memory storage for demonstration
// In production, this would use persistent storage
const memoryStore = new Map();

export default {
  meta: {
    name: 'memory-context-persistence',
    version: '1.0.0',
    description: 'Stores facts from previous interactions and injects them into future prompts.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    // Extract and store facts from responses
    tap(
      'response:filter',
      async (ctx) => {
        const { output, requestId } = ctx.data;

        // Simple fact extraction: look for statements that seem like facts
        const facts = extractFacts(output);
        if (facts.length > 0) {
          const existing = memoryStore.get(requestId) || [];
          memoryStore.set(requestId, [...existing, ...facts]);
        }

        return {};
      },
      HookPriority.LOW
    );

    // Inject relevant memories into prompts
    tap(
      'prompt:pre-process',
      async (ctx) => {
        const { prompt, requestId } = ctx.data;

        // Get memories from this conversation
        const memories = memoryStore.get(requestId) || [];

        if (memories.length > 0) {
          const relevantMemories = findRelevantMemories(prompt, memories);
          if (relevantMemories.length > 0) {
            const memoryContext = `Previous context:\n${relevantMemories.map(fact => `- ${fact}`).join('\n')}\n\n`;
            const enhancedPrompt = memoryContext + prompt;
            return { data: { ...ctx.data, prompt: enhancedPrompt } };
          }
        }

        return {};
      },
      HookPriority.NORMAL
    );
  },
};

// Helper functions
function extractFacts(text) {
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

  return facts.slice(0, 5); // Limit to 5 facts per response
}

function findRelevantMemories(prompt, memories) {
  // Simple relevance check - if memory contains words from prompt
  const promptWords = prompt.toLowerCase().split(/\s+/);
  const relevant = [];

  for (const memory of memories) {
    const memoryWords = memory.toLowerCase().split(/\s+/);
    const overlap = promptWords.filter(word => memoryWords.includes(word)).length;
    if (overlap >= 2) { // At least 2 overlapping words
      relevant.push(memory);
    }
  }

  return relevant.slice(0, 3); // Limit to 3 relevant memories
}
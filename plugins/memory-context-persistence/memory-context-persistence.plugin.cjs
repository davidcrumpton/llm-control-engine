// plugins/memory-context-persistence/memory-context-persistence.plugin.cjs

module.exports = {
  meta: {
    name: 'memory-context-persistence',
    version: '1.1.0',
    description: 'Persists conversation memory across requests.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    const memoryStore = new Map();

    tap(
      'inference:pre',
      async (ctx) => {
        const { sessionId } = ctx.data;
        const memory = memoryStore.get(sessionId) || [];
        return { data: { ...ctx.data, memory } };
      },
      500
    );

    tap(
      'inference:post',
      async (ctx) => {
        const { sessionId, output } = ctx.data;
        const memory = memoryStore.get(sessionId) || [];
        memory.push({ role: 'assistant', content: output });
        memoryStore.set(sessionId, memory);
        return {};
      },
      500
    );
  },
};

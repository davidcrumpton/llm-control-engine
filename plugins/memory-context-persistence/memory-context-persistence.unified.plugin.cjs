// plugins/memory-context-persistence/memory-context-persistence.unified.plugin.cjs
module.exports = {
  type: 'hook',
  name: 'memory-context-persistence',
  version: '1.1.0',
  description: 'Unified plugin: persists memory across requests.',
  tags: ['memory', 'context'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
    },
  },

  memoryStore: new Map(),

  async run({ event, data, parameters, plugin }) {
    if (!parameters.enabled) return {};

    const store = plugin.memoryStore;
    const { sessionId } = data;

    if (event === 'inference:pre') {
      const memory = store.get(sessionId) || [];
      return { outcome: 'modified', data: { ...data, memory } };
    }

    if (event === 'inference:post') {
      const memory = store.get(sessionId) || [];
      memory.push({ role: 'assistant', content: data.content });
      store.set(sessionId, memory);
      return {};
    }

    return {};
  },
};

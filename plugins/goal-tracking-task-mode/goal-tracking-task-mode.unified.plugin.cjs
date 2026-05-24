// plugins/goal-tracking-task-mode/goal-tracking-task-mode.unified.plugin.cjs
module.exports = {
  type: 'hook',
  name: 'goal-tracking-task-mode',
  version: '1.1.0',
  description: 'Unified plugin: tracks goals and tasks.',
  tags: ['goals', 'tasks'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
    },
  },

  goals: new Map(),

  async run({ event, data, parameters, plugin }) {
    if (!parameters.enabled) return {};

    const store = plugin.goals;
    const { sessionId } = data;

    if (event === 'inference:pre') {
      const sessionGoals = store.get(sessionId) || [];
      return { outcome: 'modified', data: { ...data, goals: sessionGoals } };
    }

    if (event === 'inference:post') {
      const sessionGoals = store.get(sessionId) || [];
      sessionGoals.push({ step: sessionGoals.length + 1, output: data.content });
      store.set(sessionId, sessionGoals);
      return {};
    }

    return {};
  },
};

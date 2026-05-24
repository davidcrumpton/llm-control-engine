// plugins/goal-tracking-task-mode/goal-tracking-task-mode.plugin.cjs


module.exports = {
  meta: {
    name: 'goal-tracking-task-mode',
    version: '1.1.0',
    description: 'Tracks goals and tasks across conversation.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    const goals = new Map();

    tap(
      'inference:pre',
      async (ctx) => {
        const { sessionId } = ctx.data;
        const sessionGoals = goals.get(sessionId) || [];
        return { data: { ...ctx.data, goals: sessionGoals } };
      },
      500
    );

    tap(
      'inference:post',
      async (ctx) => {
        const { sessionId, output } = ctx.data;
        const sessionGoals = goals.get(sessionId) || [];
        sessionGoals.push({ step: sessionGoals.length + 1, output });
        goals.set(sessionId, sessionGoals);
        return {};
      },
      500
    );
  },
};

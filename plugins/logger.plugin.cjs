// plugins/lifecycle-logger.plugin.cjs

// Define the events locally to avoid 'llmctrlx' import errors in pkg
const HOOK_EVENTS = [
  'prompt:pre-process',
  'prompt:post-process',
  'request:pre-send',
  'response:pre-filter',
  'response:filter',
  'response:post-filter'
];

// Use a numeric value for MONITOR priority to avoid importing HookPriority
const MONITOR_PRIORITY = -100; 

const loggerPlugin = {
  meta: {
    name: 'lifecycle-logger',
    version: '1.1.0',
    description: 'Logs all hook lifecycle events with timing information.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    const startTimes = new Map();

    for (const event of HOOK_EVENTS) {
      tap(
        event,
        async (ctx) => {
          // Fallback for requests missing meta/requestId
          const requestId = ctx.meta?.requestId || 'unknown';
          
          if (event === 'prompt:pre-process') {
            startTimes.set(requestId, Date.now());
          }

          const elapsed = startTimes.has(requestId)
            ? Date.now() - startTimes.get(requestId)
            : 0;

          console.log(`[logger] ${event} (${elapsed}ms):`, {
            requestId: requestId,
            data: ctx.data,
          });

          return {};
        },
        MONITOR_PRIORITY
      );
    }
  },

  uninstall() {
    console.log('[logger] Lifecycle logger plugin uninstalled.');
  },
};

module.exports = loggerPlugin;

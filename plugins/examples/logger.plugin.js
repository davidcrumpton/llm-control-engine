/**
 * Example Plugin: Lifecycle Logger
 *
 * Subscribes to every hook event at MONITOR priority and logs
 * timing, payloads, and metadata. Useful for debugging and
 * understanding the hook execution flow.
 */

import { HOOK_EVENTS, HookPriority } from 'llmctrlx/plugin-api/hooks';

const loggerPlugin = {
  meta: {
    name: 'lifecycle-logger',
    version: 'v1.0.0',
    description: 'Logs all hook lifecycle events with timing information.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    const startTimes = new Map();

    for (const event of HOOK_EVENTS) {
      tap(
        event,
        async (ctx) => {
          const key = `${ctx.meta.requestId}::${event}`;

          if (event === 'prompt:pre-process') {
            startTimes.set(ctx.meta.requestId, Date.now());
          }

          const elapsed = startTimes.has(ctx.meta.requestId)
            ? Date.now() - startTimes.get(ctx.meta.requestId)
            : 0;

          console.log(`[logger] ${event} (${elapsed}ms):`, {
            requestId: ctx.meta.requestId,
            data: ctx.data,
          });

          return {};
        },
        HookPriority.MONITOR,
      );
    }
  },

  uninstall() {
    console.log('[logger] Lifecycle logger plugin uninstalled.');
  },
};

export default loggerPlugin;

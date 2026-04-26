/**
 * Example Plugin: Prompt Guard
 *
 * Demonstrates the bail pattern. Subscribes to `inference:pre`
 * at HIGH priority and blocks inference when the prompt matches
 * configurable deny-patterns.
 */

import { HookPriority } from 'llmctrlx/plugin-api/hooks';

// Configuration
const DEFAULT_CONFIG = {

const promptGuardPlugin = {
  meta: {
    name: 'prompt-guard',
    version: '1.0.0',
    description: 'Blocks prompts matching configurable deny-patterns (bail pattern demo).',
    author: 'LLM Control Engine',
  },

  install(tap) {
    const config = { ...DEFAULT_CONFIG };

    tap(
      'inference:pre',
      async (ctx) => {
        const { prompt } = ctx.data;

        for (const pattern of config.denyPatterns) {
          if (pattern.test(prompt)) {
            return {
              bail: true,
              reason: `${config.blockMessage} (matched: ${pattern.source})`,
            };
          }
        }

        return {};
      },
      HookPriority.HIGH,
    );

    tap('prompt:pre-process', async (ctx) => {
      return { data: ctx.data };
    }, HookPriority.HIGH);
  },
};

export default promptGuardPlugin;

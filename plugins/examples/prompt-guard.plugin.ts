/**
 * Example Plugin: Prompt Guard
 *
 * Demonstrates the bail pattern. Subscribes to `inference:pre`
 * at HIGH priority and blocks inference when the prompt matches
 * configurable deny-patterns.
 */

import { HookPlugin, HookPriority, HookContext, HookResult } from '../../src/plugins/index.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface GuardConfig {
  denyPatterns: RegExp[];
  blockMessage: string;
}

const DEFAULT_CONFIG: GuardConfig = {
  denyPatterns: [
    /ignore\s+(all\s+)?(previous\s+)?instructions/i,
    /system\s*prompt/i,
    /\bDAN\b/,
    /do\s+anything\s+now/i,
    /\b(sudo|doas|su)\b/i,
    /chmod\s+.*[0-7]{3,4}/i,
  ],
  blockMessage: 'Request blocked by prompt-guard: potential security risk detected.',
};

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

const promptGuardPlugin: HookPlugin = {
  meta: {
    name: 'prompt-guard',
    version: '1.0.0',
    description: 'Blocks prompts matching configurable deny-patterns (bail pattern demo).',
    author: 'LLM Control Engine',
  },

  install(tap) {
    const config = { ...DEFAULT_CONFIG };

    tap<{ prompt: string }>(
      'inference:pre',
      async (ctx: HookContext<{ prompt: string }>): Promise<HookResult<{ prompt: string }>> => {
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

    tap('prompt:pre-process', async (ctx: HookContext) => {
      return { data: ctx.data };
    }, HookPriority.HIGH);
  },
};

export default promptGuardPlugin;
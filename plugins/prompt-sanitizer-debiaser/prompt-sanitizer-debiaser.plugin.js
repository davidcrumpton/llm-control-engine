// plugins/prompt-sanitizer-debiaser/prompt-sanitizer-debiaser.plugin.js
import { HookPriority } from 'llmctrlx/plugin-api/hooks';

const JAILBREAK_PATTERNS = [
  /ignore\s+(all\s+)?(previous\s+)?instructions/i,
  /system\s*prompt/i,
  /\bDAN\b/i,
  /do\s+anything\s+now/i,
  /\b(sudo|doas|su)\b/i,
  /developer\s+mode/i,
  /unrestricted\s+mode/i,
];

const FILLER_WORDS = [
  'um', 'uh', 'like', 'you know', 'sort of', 'kind of',
  'basically', 'actually', 'literally', 'totally',
];

export default {
  meta: {
    name: 'prompt-sanitizer-debiaser',
    version: '1.0.0',
    description: 'Cleans prompts by removing filler words, fixing grammar, and blocking jailbreak attempts.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    tap(
      'prompt:pre-process',
      async (ctx) => {
        let { prompt } = ctx.data;

        // Check for jailbreak attempts
        for (const pattern of JAILBREAK_PATTERNS) {
          if (pattern.test(prompt)) {
            return {
              bail: true,
              reason: 'Prompt contains potential jailbreak attempt and was blocked.',
            };
          }
        }

        // Clean up the prompt
        let cleaned = prompt;

        // Remove filler words
        for (const filler of FILLER_WORDS) {
          const regex = new RegExp(`\\b${filler}\\b`, 'gi');
          cleaned = cleaned.replace(regex, '');
        }

        // Normalize whitespace
        cleaned = cleaned.replace(/\s+/g, ' ').trim();

        // Fix common grammar issues
        cleaned = cleaned.replace(/\bi\b/g, 'I'); // Capitalize "i"
        cleaned = cleaned.replace(/([.!?])\s*([a-z])/g, (match, p1, p2) => p1 + ' ' + p2.toUpperCase()); // Capitalize after punctuation

        // Expand common shorthand
        cleaned = cleaned.replace(/\bim\b/gi, "I'm");
        cleaned = cleaned.replace(/\bdont\b/gi, "don't");
        cleaned = cleaned.replace(/\bcant\b/gi, "can't");
        cleaned = cleaned.replace(/\bwont\b/gi, "won't");

        return { data: { ...ctx.data, prompt: cleaned } };
      },
      HookPriority.HIGH
    );
  },
};
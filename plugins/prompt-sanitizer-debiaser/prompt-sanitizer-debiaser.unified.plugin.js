// plugins/prompt-sanitizer-debiaser/prompt-sanitizer-debiaser.unified.plugin.js
const DEFAULT_JAILBREAK_PATTERNS = [
  /ignore\s+(all\s+)?(previous\s+)?instructions/i,
  /system\s*prompt/i,
  /\bDAN\b/i,
  /do\s+anything\s+now/i,
  /\b(sudo|doas|su)\b/i,
  /developer\s+mode/i,
  /unrestricted\s+mode/i,
];

const DEFAULT_FILLER_WORDS = [
  'um', 'uh', 'like', 'you know', 'sort of', 'kind of',
  'basically', 'actually', 'literally', 'totally',
];

export default {
  type: 'policy',
  name: 'prompt-sanitizer-debiaser',
  version: 'v1.0.0',
  description: 'Unified plugin version: cleans prompts and blocks jailbreak attempts.',
  tags: ['security', 'sanitization', 'grammar'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      jailbreakPatterns: {
        type: 'array',
        items: { type: 'string' },
        default: DEFAULT_JAILBREAK_PATTERNS.map(p => p.source),
      },
      fillerWords: {
        type: 'array',
        items: { type: 'string' },
        default: DEFAULT_FILLER_WORDS,
      },
      expandShorthand: { type: 'boolean', default: true },
      fixGrammar: { type: 'boolean', default: true },
    },
  },

  async run({ event, data, parameters }) {
    if (event !== 'prompt:pre-process' || !parameters.enabled) return {};

    let { prompt } = data;

    // Check for jailbreak attempts
    const patterns = parameters.jailbreakPatterns.map(p => new RegExp(p, 'i'));
    for (const pattern of patterns) {
      if (pattern.test(prompt)) {
        return {
          outcome: 'blocked',
          reason: 'Prompt contains potential jailbreak attempt and was blocked.',
        };
      }
    }

    // Clean up the prompt
    let cleaned = prompt;

    // Remove filler words
    for (const filler of parameters.fillerWords) {
      const regex = new RegExp(`\\b${filler}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '');
    }

    // Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    if (parameters.fixGrammar) {
      // Fix common grammar issues
      cleaned = cleaned.replace(/\bi\b/g, 'I'); // Capitalize "i"
      cleaned = cleaned.replace(/([.!?])\s*([a-z])/g, (match, p1, p2) => p1 + ' ' + p2.toUpperCase()); // Capitalize after punctuation
    }

    if (parameters.expandShorthand) {
      // Expand common shorthand
      cleaned = cleaned.replace(/\bim\b/gi, "I'm");
      cleaned = cleaned.replace(/\bdont\b/gi, "don't");
      cleaned = cleaned.replace(/\bcant\b/gi, "can't");
      cleaned = cleaned.replace(/\bwont\b/gi, "won't");
    }

    return {
      outcome: 'sanitized',
      data: { ...data, prompt: cleaned },
    };
  },
};
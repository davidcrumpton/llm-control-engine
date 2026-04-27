// plugins/knowledge-pack-loader/knowledge-pack-loader.unified.plugin.js
// Simulated knowledge base
const DEFAULT_KNOWLEDGE_PACKS = {
  'javascript': `
JavaScript Knowledge:
- JavaScript is a high-level, interpreted programming language.
- Key features: dynamic typing, first-class functions, prototype-based inheritance.
- Modern JS uses ES6+ features like arrow functions, async/await, modules.
- Popular frameworks: React, Vue, Angular, Node.js for backend.
`,

  'python': `
Python Knowledge:
- Python is a high-level, interpreted programming language known for readability.
- Key features: indentation-based syntax, dynamic typing, extensive standard library.
- Popular for: web development (Django, Flask), data science (pandas, numpy), AI (TensorFlow, PyTorch).
- Philosophy: "There should be one obvious way to do it."
`,

  'git': `
Git Knowledge:
- Git is a distributed version control system.
- Key commands: init, add, commit, push, pull, merge, rebase.
- Branching strategy: main/master branch, feature branches, pull requests.
- Best practices: commit often, write clear messages, use .gitignore.
`,

  'docker': `
Docker Knowledge:
- Docker is a platform for developing, shipping, and running applications in containers.
- Key concepts: images, containers, Dockerfile, docker-compose.yml.
- Benefits: consistent environments, isolation, portability.
- Commands: build, run, exec, logs, ps, images.
`,
};

export default {
  type: 'hook',
  name: 'knowledge-pack-loader',
  version: 'v1.0.0',
  description: 'Unified plugin version: injects domain-specific knowledge into prompts.',
  tags: ['knowledge', 'context', 'domain-specific'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
      knowledgePacks: {
        type: 'object',
        additionalProperties: { type: 'string' },
        default: DEFAULT_KNOWLEDGE_PACKS,
      },
      relatedTerms: {
        type: 'object',
        additionalProperties: { type: 'array', items: { type: 'string' } },
        default: {
          'javascript': ['js', 'node', 'npm', 'react', 'vue', 'angular', 'typescript'],
          'python': ['py', 'django', 'flask', 'pandas', 'numpy', 'pip'],
          'git': ['github', 'version control', 'commit', 'branch', 'merge'],
          'docker': ['container', 'image', 'compose', 'kubernetes', 'k8s'],
        },
      },
    },
  },

  async run({ event, data, parameters }) {
    if (event !== 'prompt:pre-process' || !parameters.enabled) return {};

    const { prompt } = data;

    // Detect relevant knowledge domains
    const relevantPacks = detectRelevantPacks(prompt, parameters);

    if (relevantPacks.length > 0) {
      const knowledgeContext = relevantPacks
        .map(pack => parameters.knowledgePacks[pack])
        .filter(Boolean)
        .join('\n\n');

      if (knowledgeContext) {
        const enhancedPrompt = `Relevant knowledge:\n${knowledgeContext}\n\nUser question: ${prompt}`;
        return {
          outcome: 'enriched',
          data: { ...data, prompt: enhancedPrompt },
        };
      }
    }

    return {};
  },
};

// Helper function
function detectRelevantPacks(prompt, parameters) {
  const lowerPrompt = prompt.toLowerCase();
  const detected = [];

  for (const pack of Object.keys(parameters.knowledgePacks)) {
    // Check if prompt mentions the technology/framework
    if (lowerPrompt.includes(pack)) {
      detected.push(pack);
    }

    // Check for related terms
    const terms = parameters.relatedTerms[pack] || [];
    if (terms.some(term => lowerPrompt.includes(term))) {
      detected.push(pack);
    }
  }

  return [...new Set(detected)]; // Remove duplicates
}
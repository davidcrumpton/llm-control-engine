// plugins/knowledge-pack-loader/knowledge-pack-loader.plugin.js
import { HookPriority } from 'llmctrlx/plugin-api/hooks';

// Simulated knowledge base
const KNOWLEDGE_PACKS = {
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
  meta: {
    name: 'knowledge-pack-loader',
    version: '1.0.0',
    description: 'Injects domain-specific context from knowledge packs.',
    author: 'LLM Control Engine',
  },

  install(tap) {
    tap(
      'prompt:pre-process',
      async (ctx) => {
        const { prompt } = ctx.data;

        // Detect relevant knowledge domains
        const relevantPacks = detectRelevantPacks(prompt);

        if (relevantPacks.length > 0) {
          const knowledgeContext = relevantPacks
            .map(pack => KNOWLEDGE_PACKS[pack])
            .filter(Boolean)
            .join('\n\n');

          if (knowledgeContext) {
            const enhancedPrompt = `Relevant knowledge:\n${knowledgeContext}\n\nUser question: ${prompt}`;
            return { data: { ...ctx.data, prompt: enhancedPrompt } };
          }
        }

        return {};
      },
      HookPriority.NORMAL
    );
  },
};

// Helper function
function detectRelevantPacks(prompt) {
  const lowerPrompt = prompt.toLowerCase();
  const detected = [];

  for (const [pack, content] of Object.entries(KNOWLEDGE_PACKS)) {
    // Check if prompt mentions the technology/framework
    if (lowerPrompt.includes(pack)) {
      detected.push(pack);
    }

    // Check for related terms
    const relatedTerms = {
      'javascript': ['js', 'node', 'npm', 'react', 'vue', 'angular', 'typescript'],
      'python': ['py', 'django', 'flask', 'pandas', 'numpy', 'pip'],
      'git': ['github', 'version control', 'commit', 'branch', 'merge'],
      'docker': ['container', 'image', 'compose', 'kubernetes', 'k8s'],
    };

    const terms = relatedTerms[pack] || [];
    if (terms.some(term => lowerPrompt.includes(term))) {
      detected.push(pack);
    }
  }

  return [...new Set(detected)]; // Remove duplicates
}
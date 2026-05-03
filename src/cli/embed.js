/**
 * Embed command handler for llmctrlx
 */

import fs from 'fs/promises';

/**
 * Helper to perform the embedding call
 * @param {Object} llm - LLM provider instance
 * @param {string} model - Model name
 * @param {string} content - The text to embed
 * @returns {Promise<Object>}
 */
async function performEmbedding(llm, model, content) {
  const res = await llm.embeddings({
    model,
    prompt: content
  });
  return res.embedding;
}

/**
 * Handle embed command
 * @param {Object} llm - LLM provider instance
 * @param {Object} options - CLI options
 */
export async function cmdEmbed(llm, options) {
  const { model, stdin, files } = options;

  // 1. Validation
  if (!files && !stdin) {
    console.error('Error: Provide files with -f or stdin with --s or --stdin');
    process.exit(1);
  }

  try {
    const tasks = [];

    // 2. Prepare Stdin Task
    if (stdin) {
      const stdinTask = (async () => {
        const content = await new Promise((resolve, reject) => {
          let data = '';
          process.stdin.on('data', (chunk) => (data += chunk));
          process.stdin.on('end', () => resolve(data));
          process.stdin.on('error', reject);
        });
        const embedding = await performEmbedding(llm, model, content);
        return { file: 'stdin', embedding };
      })();
      tasks.push(stdinTask);
    }

    // 3. Prepare File Tasks
    const fileList = Array.isArray(files) ? files : [files];
    for (const filePath of fileList) {
      const fileTask = (async () => {
        const content = await fs.readFile(filePath, 'utf8');
        const embedding = await performEmbedding(llm, model, content);
        return { file: filePath, embedding };
      })();
      tasks.push(fileTask);
    }

    // 4. Execute all tasks in parallel
    // We use allSettled so that one failing file doesn't kill the entire batch
    const results = await Promise.allSettled(tasks);

    // 5. Format output
    const successfulResults = results
      .filter((res) => res.status === 'fulfilled')
      .map((res) => res.value);

    const failures = results
      .filter((res) => res.status === 'rejected')
      .map((res) => res.reason.message);

    if (failures.length > 0) {
      console.error('Errors encountered:', failures);
    }

    console.log(JSON.stringify(successfulResults, null, 2));

  } catch (err) {
    console.error('Fatal error during embedding process:', err.message);
    process.exit(1);
  }
}
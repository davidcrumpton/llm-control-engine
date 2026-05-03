/**
 * Bench command handler for llmctrlx
 */

/**
 * Handle bench command
 * @param {Object} llm - LLM provider instance
 * @param {Object} options - CLI options
 */
export async function cmdBench(llm, options) {
  // 1. Guard against undefined models
  if (!options.model) {
    console.error("Error: No models specified. Use --model='model1,model2'");
    return;
  }

  const models = options.model.split(',').map(m => m.trim());

  let userContent = options.user || 'Hello';
  if (options.stdin) {
    try {
      userContent = await new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf-8');
        process.stdin.on('data', chunk => (data += chunk));
        process.stdin.on('end', () => resolve(data.trim()));
        process.stdin.on('error', reject);
      });
    } catch (err) {
      console.error("Error reading stdin:", err);
      return;
    }
  }

  // 2. Use map to create an array of promises
  const tasks = models.map(async (model) => {
    try {
      const start = Date.now();
      const response = await llm.chat({ // Assuming method name is chat or similar
        model: model,
        messages: [{ role: 'user', content: userContent }]
      });
      const duration = Date.now() - start;

      return {
        model,
        status: 'success',
        latency: `${duration}ms`,
        tokens: response.usage?.total_tokens || 'N/A'
      };
    } catch (error) {
      return {
        model,
        status: 'failed',
        error: error.message.substring(0, 30) // Truncate error for table readability
      };
    }
  });

  // 3. Wait for all tasks to complete (even if they fail)
  const results = await Promise.all(tasks);

  // 4. Output results
  console.table(results);
}

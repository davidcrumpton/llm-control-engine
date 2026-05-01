/**
 * Bench command handler for llmctrlx
 */

/**
 * Handle bench command
 * @param {Object} llm - LLM provider instance
 * @param {Object} options - CLI options
 */
export async function cmdBench(llm, options) {
  const models = options.model.split(',')

  // Read from stdin if --stdin flag is set, otherwise fall back to --user or default prompt
  let userContent = options.user || 'Hello'
  if (options.stdin) {
    userContent = await new Promise((resolve, reject) => {
      let data = ''
      process.stdin.setEncoding('utf-8')
      process.stdin.on('data', chunk => (data += chunk))
      process.stdin.on('end', () => resolve(data.trim()))
      process.stdin.on('error', reject)
    })
  }

  const results = await Promise.all(
    models.map(async (m) => {
      const start = Date.now()

      const res = await llm.chat({
        model: m,
        messages: [{ role: 'user', content: userContent }]
      })

      return {
        model: m,
        time: Date.now() - start,
        tokens: res.eval_count
      }
    })
  )

  console.table(results)
}

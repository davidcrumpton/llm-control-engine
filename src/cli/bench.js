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

  const results = await Promise.all(
    models.map(async (m) => {
      const start = Date.now()

      const res = await llm.chat({
        model: m,
        messages: [{ role: 'user', content: options.user || 'Hello' }]
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

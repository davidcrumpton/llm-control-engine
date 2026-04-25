/**
 * Embed command handler for llmctrlx
 */

import fs from 'fs'

/**
 * Handle embed command
 * @param {Object} llm - LLM provider instance
 * @param {Object} options - CLI options
 */
export async function cmdEmbed(llm, options) {
  if (!options.files) {
    console.error('Provide files with -f')
    process.exit(1)
  }

  const files = Array.isArray(options.files) ? options.files : [options.files]

  const results = []

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8')
    const res = await llm.embeddings({
      model: options.model,
      prompt: content
    })

    results.push({ file, embedding: res.embedding })
  }

  console.log(JSON.stringify(results, null, 2))
}

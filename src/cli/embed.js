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
  // -f or --stdin is required
  if (!options.files && !options.stdin) {
    console.error('Provide files with -f or stdin with --s or --stdin')
    process.exit(1)
  }

  if (options.stdin) {
    const content = await new Promise((resolve) => {
      let data = ''
      process.stdin.on('data', (chunk) => {
        data += chunk
      })
      process.stdin.on('end', () => {
        resolve(data)
      })
    })
    // Process stdin content as a single file
    const res = await llm.embeddings({
      model: options.model,
      prompt: content
    })
    console.log(JSON.stringify({ file: 'stdin', embedding: res.embedding }, null, 2))
    return
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

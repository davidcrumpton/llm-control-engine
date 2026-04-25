/**
 * Run command handler for llmctrlx
 */

import { execSync } from 'child_process'

/**
 * Handle run command
 * @param {Object} llm - LLM provider instance
 * @param {Object} options - CLI options
 */
export async function cmdRun(llm, options) {
  if (!options.user) {
    console.error('Provide command with -u')
    process.exit(1)
  }

  const output = execSync(options.user).toString()

  const res = await llm.chat({
    model: options.model,
    messages: [
      { role: 'user', content: `Command output:\n${output}` }
    ]
  })

  console.log(res.message.content)
}

/**
 * Run command handler for llmctrlx
 */

import { execSync } from 'child_process'

/**
 * Handle run command
 * @param {Object} llm - LLM provider instance
 * @param {Object} options - CLI options
 * @param {Object} engineHooks - Engine hooks integration for plugin system
 */
export async function cmdRun(llm, options, engineHooks) {
  if (!options.user) {
    console.error('Provide command with -u')
    process.exit(1)
  }

  // Check if the command is allowed via the hook system
  if (engineHooks) {
    const gate = await engineHooks.gateInference('run', options.user)
    if (!gate.allowed) {
      console.error(`Command blocked: ${gate.reason}`)
      process.exit(1)
    }
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

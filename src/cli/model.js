/**
 * Model command handler for llmctrlx
 */

/**
 * Handle model command
 * @param {Object} llm - LLM provider instance
 * @param {Object} options - CLI options
 */
export async function cmdModel(llm, options) {
  if (options.list) {
    const res = await llm.list()
    if (options.provider === 'ollama' && res.models) {
      res.models.forEach(m => console.log(m.name))  // m.name is the model name for ollama.
    } else if (res.models) {
      res.models.forEach(m => console.log(m.id))  // m.id is the model name for LMstudio
    } else {
      console.log('No models found')
    }
    return
  }

  if (options.show) {
    const res = await llm.show({ model: options.model })
    console.log(JSON.stringify(res, null, 2))
    return
  }

  if (options.pull) {
    await llm.pull({ model: options.model })
    return
  }

  if (options.delete) {
    await llm.delete({ model: options.model })
    return
  }

  console.log('model commands: --list, --show, --pull, --delete')
}

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
    // unsuppoted for lmstudio, but supported for ollama, so we just pass through to the provider and let it handle it.
    if (options.provider === 'lmstudio') {
      console.error('Show command is not supported for LMStudio provider')
      return
    }
    const res = await llm.show({ model: options.model })
    console.log(JSON.stringify(res, null, 2))
    return
  }

  if (options.pull) {
    // unsuppoted for lmstudio, but supported for ollama, so we just pass through to the provider and let it handle it.
    if (options.provider === 'lmstudio') {
      console.error('Pull command is not supported for LMStudio provider')
      return
    }
    await llm.pull({ model: options.model })
    return
  }

  if (options.delete) {
    // unsuppoted for lmstudio, but supported for ollama, so we just pass through to the provider and let it handle it.
    if (options.provider === 'lmstudio') {
      console.error('Delete command is not supported for LMStudio provider')
      return
    }
    await llm.delete({ model: options.model })
    return
  }

  console.log('model commands: --list, --pull, --delete')
}

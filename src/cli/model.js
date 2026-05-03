/**
 * Model command handler for llmctrlx
 */

/**
 * Handle model command
 * @param {Object} llm - LLM provider instance
 * @param {Object} options - CLI options
 */
export async function cmdModel(llm, options) {
  const { list } = options;

  // 1. Handle List
  if (list) {
    const res = await llm.list();
    if (!res || !res.models || res.models.length === 0) {
      console.log('No models found');
      return;
    }
    res.models.forEach(m => console.log(m));
    return;
  }

  // 2. Identify the action and the target model
  const actionMap = {
    show: { method: 'show', label: 'show' },
    pull: { method: 'pull', label: 'pull' },
    delete: { method: 'delete', label: 'delete' }
  };

  const actionKey = Object.keys(actionMap).find(key => options[key]);
  
  if (actionKey) {
    const action = actionMap[actionKey];

    // Validation: Ensure model name is provided
    if (!options.model) {
      console.error(`Error: Model name must be provided for ${action.label} command.`);
      return;
    }

    // Validation: Check if the provider supports this capability
    // This assumes your provider classes have a 'capabilities' object or similar
    if (!llm.capabilities?.includes(action.method)) {
      console.error(`${action.label.charAt(0).toUpperCase() + action.label.slice(1)} command is not supported by this provider.`);
      return;
    }

    // Execution
    try {
      const res = await llm[action.method]({ model: options.model });
      if (action.method === 'show' && res) {
        console.log(JSON.stringify(res, null, 2));
      }
    } catch (err) {
      console.error(`Error executing ${action.label}: ${err.message}`);
    }
    return;
  }

  // 3. Default: Help Message
  // Ideally, the provider itself should provide its own help string
  console.log(llm.getHelpMessage ? llm.getHelpMessage() : 'model commands: --list, --show <model>, --pull <model>, --delete <model>');
}

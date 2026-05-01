/**
 * Policy validation engine for llmctrlx
 */

/**
 * Validates the global plan policy before execution.
 * Checks model allow/deny lists defined under `policy.model`.
 *
 * @param {Object} plan - The parsed plan YAML object
 */
export function validatePolicy(plan) {
  const policy = plan.policy || {}

  if (policy.model) {
    const { allow, deny } = policy.model
    const model = plan.model && plan.model.name ? plan.model.name : plan.model

    // Check if model is allowed
    if (model && allow && Array.isArray(allow)) {
      const matchedPattern = allow.find(pattern => matchPattern(model, pattern))
      if (!matchedPattern) {
        throw new Error(
          `Policy violation: Model '${model}' is not in the allow list (policy.model.allow: [${allow.join(', ')}]).`
        )
      }
    }

    // Check if model is denied
    if (model && deny && Array.isArray(deny)) {
      const matchedPattern = deny.find(pattern => matchPattern(model, pattern))
      if (matchedPattern) {
        throw new Error(
          `Policy violation: Model '${model}' is explicitly denied by pattern '${matchedPattern}' (policy.model.deny).`
        )
      }
    }
  }
}

/**
 * Validates a single step against the policy.
 * Handles 'tool' steps (policy.tools) and 'exec' steps (policy.exec).
 *
 * @param {Object} step   - The step object
 * @param {Object} policy - The plan policy object
 */
export function validateStep(step, policy = {}) {
  if (step.type === 'tool') {
    const toolName = step.tool
    const toolPolicy = policy.tools || {}

    if (toolPolicy.allow && Array.isArray(toolPolicy.allow)) {
      const matchedPattern = toolPolicy.allow.find(pattern => matchPattern(toolName, pattern))
      if (!matchedPattern) {
        throw new Error(
          `Policy violation: Tool '${toolName}' is not allowed in step '${step.id}' (policy.tools.allow: [${toolPolicy.allow.join(', ')}]).`
        )
      }
    }

    if (toolPolicy.deny && Array.isArray(toolPolicy.deny)) {
      const matchedPattern = toolPolicy.deny.find(pattern => matchPattern(toolName, pattern))
      if (matchedPattern) {
        throw new Error(
          `Policy violation: Tool '${toolName}' is explicitly denied in step '${step.id}' by pattern '${matchedPattern}' (policy.tools.deny).`
        )
      }
    }
  }

  if (step.exec) {
    // Extract just the executable name (first token) for policy matching.
    // Full shell-metacharacter and allow-list checks still happen at runtime
    // in executeStep(); this enforces the plan-level policy on top of that.
    const executable = step.exec.trim().split(/\s+/)[0]
    const execPolicy = policy.exec || {}

    if (execPolicy.allow && Array.isArray(execPolicy.allow)) {
      const matchedPattern = execPolicy.allow.find(pattern => matchPattern(executable, pattern))
      if (!matchedPattern) {
        throw new Error(
          `Policy violation: Executable '${executable}' is not allowed in step '${step.id}' (policy.exec.allow: [${execPolicy.allow.join(', ')}]).`
        )
      }
    }

    if (execPolicy.deny && Array.isArray(execPolicy.deny)) {
      const matchedPattern = execPolicy.deny.find(pattern => matchPattern(executable, pattern))
      if (matchedPattern) {
        throw new Error(
          `Policy violation: Executable '${executable}' is explicitly denied in step '${step.id}' by pattern '${matchedPattern}' (policy.exec.deny).`
        )
      }
    }
  }
}

/**
 * Glob-style pattern matching supporting '*' wildcards anywhere in the pattern.
 *
 * Examples:
 *   matchPattern('claude-3-sonnet', 'claude-*')        → true
 *   matchPattern('claude-3-sonnet', '*-sonnet*')        → true
 *   matchPattern('gpt-4o', '*-4o')                     → true
 *   matchPattern('claude-3-sonnet', 'claude-3-haiku')   → false
 *
 * @param {string} value   - The value to test (e.g. a model name or tool name)
 * @param {string} pattern - The pattern, may contain '*' wildcards
 * @returns {boolean}
 */
function matchPattern(value, pattern) {
  if (!value) return false

  // Fast path: no wildcard
  if (!pattern.includes('*')) return value === pattern

  // Convert glob pattern to a regex:
  //   - escape all regex special chars except '*'
  //   - replace '*' with '.*'
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
  const re = new RegExp(`^${escaped}$`)
  return re.test(value)
}
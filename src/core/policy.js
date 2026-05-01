/**
 * Policy validation engine for llmctrlx
 */

/**
 * Validates the global plan policy before execution.
 * Checks model allow/deny lists defined under `policy.model`.
 *
 * Model policy is deny-by-default: if an allow list is present, the model
 * must match at least one entry or execution is refused.
 *
 * @param {Object} plan - The parsed plan YAML object
 */
export function validatePolicy(plan) {
  const policy = plan.policy || {}

  if (policy.model) {
    const { allow, deny } = policy.model
    const model = plan.model && plan.model.name ? plan.model.name : plan.model

    // Deny by default: model must appear in the allow list if one is defined
    if (model && allow && Array.isArray(allow)) {
      const matchedPattern = allow.find(pattern => matchPattern(model, pattern))
      if (!matchedPattern) {
        throw new Error(
          `Policy violation: Model '${model}' is not in the allow list (policy.model.allow: [${allow.join(', ')}]).`
        )
      }
    }

    // Explicit deny always wins, even if the model was also matched by allow
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
 *
 * Tool policy is deny-by-default: if an allow list is present, the tool
 * must match at least one entry or the step is refused.
 *
 * Exec policy is allow-by-default: the runtime ALLOWED_STEP_EXECUTABLES gate
 * is the primary safety net. Plan-level policy only needs to express explicit
 * denials (e.g. "this plan must never call rm or curl").
 *
 * @param {Object} step   - The step object
 * @param {Object} policy - The plan policy object
 */
export function validateStep(step, policy = {}) {
  if (step.type === 'tool') {
    const toolName = step.tool
    const toolPolicy = policy.tools || {}

    // Deny by default: tool must appear in the allow list if one is defined
    if (toolPolicy.allow && Array.isArray(toolPolicy.allow)) {
      const matchedPattern = toolPolicy.allow.find(pattern => matchPattern(toolName, pattern))
      if (!matchedPattern) {
        throw new Error(
          `Policy violation: Tool '${toolName}' is not allowed in step '${step.id}' (policy.tools.allow: [${toolPolicy.allow.join(', ')}]).`
        )
      }
    }

    // Explicit deny always wins
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
    // in executeStep(); this enforces plan-level constraints on top of that.
    const executable = step.exec.trim().split(/\s+/)[0]
    const execPolicy = policy.exec || {}

    // Allow by default: no allow list concept for exec.
    // Plans only need to express what is explicitly forbidden.
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

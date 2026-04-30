/**
 * Built-in policy plugin for safe command execution.
 *
 * Security hardening vs the original:
 *
 *  1. Validation is performed on individual argument values, not on a
 *     JSON-serialised blob.  Serialising to JSON before checking allowed
 *     bypass via Unicode escapes (e.g. \u0072m → "rm") and key/value
 *     boundaries that the regex would not interpret correctly.
 *
 *  2. The blocked-keyword check is applied to NFKC-normalised strings so
 *     Unicode lookalike characters (ｒｍ, ᵣₘ, etc.) cannot slip through.
 *
 *  3. Shell metacharacters are checked as individual codepoints, not as a
 *     combined regex over a serialised payload, which removes ambiguities
 *     introduced by JSON's own escaping.
 *
 *  4. All checks use exact word boundaries on the normalised form.
 */

// Executables that are never permitted, regardless of context.
const BLOCKED_EXECUTABLES = new Set([
  'sudo', 'doas', 'su',
  'rm', 'rmdir', 'shred', 'unlink',
  'shutdown', 'reboot', 'halt', 'poweroff', 'init', 'telinit',
  'mkfs', 'fdisk', 'parted', 'dd',
  'chmod', 'chown', 'chgrp', 'chsh', 'passwd', 'usermod', 'useradd', 'userdel',
  'mount', 'umount',
  'iptables', 'ip6tables', 'nft', 'ufw', 'firewall-cmd',
  'nc', 'netcat', 'ncat',
  'curl', 'wget', 'fetch',
  'bash', 'sh', 'dash', 'zsh', 'fish', 'ksh', 'csh', 'tcsh',
  'python', 'python3', 'ruby', 'perl', 'node', 'lua', 'php',
  // Add further blocked names as needed.
])

// Shell metacharacters that must never appear in any argument value.
// Checked as individual code points to avoid JSON-escape bypass.
const SHELL_META_CHARS = new Set([
  ';', '|', '&', '`', '$', '(', ')', '<', '>', '{', '}',
  '!', '\\', '\n', '\r', '\t',
])

/**
 * Return the NFKC-normalised, lower-cased form of a string.
 * NFKC compatibility decomposition collapses lookalike characters
 * (fullwidth letters, superscripts, etc.) to their ASCII equivalents.
 */
function normalise(str) {
  return String(str).normalize('NFKC').toLowerCase()
}

/**
 * Check a single string value for forbidden content.
 * Returns a human-readable reason string, or null if the value is safe.
 *
 * @param {string} value
 * @returns {string|null}
 */
function checkValue(value) {
  const str = String(value)
  const norm = normalise(str)

  // 1. Shell metacharacter check (code-point level, not regex-over-JSON)
  for (const ch of str) {
    if (SHELL_META_CHARS.has(ch)) {
      return `Shell metacharacter '${ch}' is not permitted.`
    }
  }

  // 2. Blocked-executable / keyword check on normalised form.
  //    Wrap in word boundaries so "normal" doesn't match "rm" etc.
  for (const blocked of BLOCKED_EXECUTABLES) {
    const normBlocked = normalise(blocked)
    // Match as a whole word: preceded/followed by non-word char or string edge.
    const pattern = new RegExp(`(?:^|\\W)${normBlocked}(?:\\W|$)`)
    if (pattern.test(norm)) {
      return `Blocked command or keyword '${blocked}' detected.`
    }
  }

  return null
}

export default {
  type: 'policy',
  name: 'safe-command-execution',
  description: 'Block unsafe command execution patterns before tools run.',

  /**
   * Called once when the policy is loaded.  No mutable state needed now that
   * checks are pure functions, but init() is kept for interface compatibility.
   */
  init() {},

  /**
   * @param {{ tool: Object, args: Record<string,unknown> }} context
   * @returns {Promise<{allow:false, message:string}|null>}
   */
  async onBeforeToolRun({ tool, args }) {
    // Check the tool name itself.
    const nameReason = checkValue(tool.name)
    if (nameReason) {
      return {
        allow: false,
        message: `Unsafe tool name blocked by policy: ${nameReason}`,
      }
    }

    // Recursively walk every argument value (supports nested objects/arrays).
    const violations = collectViolations(args, '')

    if (violations.length > 0) {
      return {
        allow: false,
        message:
          `Unsafe argument(s) blocked by policy for tool '${tool.name}': ` +
          violations.join('; '),
      }
    }

    return null
  },
}

/**
 * Recursively collect policy violations from an argument object.
 *
 * @param {unknown} value   - The value (or subtree) to inspect.
 * @param {string}  keyPath - Human-readable path for error messages.
 * @returns {string[]}      - List of violation descriptions.
 */
function collectViolations(value, keyPath) {
  const violations = []

  if (value === null || value === undefined) return violations

  if (typeof value === 'string' || typeof value === 'number') {
    const reason = checkValue(String(value))
    if (reason) {
      violations.push(`[${keyPath || 'root'}] ${reason}`)
    }
    return violations
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      violations.push(...collectViolations(value[i], `${keyPath}[${i}]`))
    }
    return violations
  }

  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      const childPath = keyPath ? `${keyPath}.${k}` : k
      violations.push(...collectViolations(v, childPath))
    }
    return violations
  }

  return violations
}

/**
 * Built-in policy plugin for safe command execution.
 * Blocks tool calls with unsafe shell-like argument patterns.
 */

export default {
  type: 'policy',
  name: 'safe-command-execution',
  description: 'Block unsafe command execution patterns before tools run.',

  init() {
    this.dangerPatterns = [
      /(^|\s)(sudo|doas|rm|shutdown|reboot|mkfs|dd|chmod|chown|passwd|chsh|mount|umount|iptables|netcat|nc|curl|wget)\b/i,
      /(;|\|\||&&|`|\$\(|>>|<<|>|<|\|)/
    ]
  },

  async onBeforeToolRun({ tool, args }) {
    const payload = JSON.stringify({ name: tool.name, args })

    for (const pattern of this.dangerPatterns) {
      if (pattern.test(payload)) {
        return {
          allow: false,
          message: `Unsafe command execution blocked by policy: '${tool.name}'.` +
            ' Avoid shell meta-characters, sudo, rm, and other privileged operations.'
        }
      }
    }

    return null
  }
}

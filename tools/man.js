export default {
  name: 'man',
  description: 'Get a specific section of a man page',
  version: 'v1.0.0',
  tags: ['os', 'system'],
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string' },
      section: { type: 'string' } // optional: NAME, SYNOPSIS, DESCRIPTION
    },
    required: ['command']
  },
  run: async ({ command, section }) => {
    const { execSync } = await import('child_process')

    try {
      const output = execSync(`man ${command} | col -b`, { encoding: 'utf-8' })

      if (!section) return output.slice(0, 2000) // hard cap

      const regex = new RegExp(`${section}\\n([\\s\\S]*?)(\\n[A-Z ]+\\n|$)`)
      const match = output.match(regex)

      return match ? match[1].trim() : `Section ${section} not found`
    } catch {
      return `No man page for ${command}`
    }
  }
}
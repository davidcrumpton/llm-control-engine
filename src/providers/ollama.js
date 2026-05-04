/**
 * Ollama LLM Provider for llmctrlx
 * Wraps the Ollama client for local LLM execution
 */

import { Ollama } from 'ollama'

export class OllamaProvider {
  static DEFAULT_HOST  = 'http://127.0.0.1:11434'
  static DEFAULT_MODEL = 'gemma4:e2b'

  constructor(opts = {}) {
    // Use caller-supplied host only when explicitly provided; fall back to
    // this provider's own default so callers never need to know the port.
    const host = opts.host || OllamaProvider.DEFAULT_HOST
    this.defaultModel = OllamaProvider.DEFAULT_MODEL
    this.client = new Ollama({ ...opts, host })
  }

  async chat(args) {
    // Normalize messages for Ollama API compatibility
    // Ollama expects content as string, not array
    if (args.messages) {
      args.messages = args.messages.map(msg => {
        if (Array.isArray(msg.content)) {
          // Flatten array content to string
          msg.content = msg.content.map(part =>
            typeof part === 'string' ? part : part.text || ''
          ).join('')
        }
        // Remove images as Ollama handles them differently or not at all
        delete msg.images
        return msg
      })
    }
    return this.client.chat(args)
  }

  async embeddings(args) {
    return this.client.embeddings(args)
  }

  async list() {
    const res = await this.client.list()
    // extract only model name
    return { models: res.models.map(m => m.name) }
  }

  async show(args) {
    return this.client.show(args)
  }

  async pull(args) {
    return this.client.pull(args)
  }

  async delete(args) {
    return this.client.delete(args)
  }

  capabilities = ['list', 'show', 'pull', 'delete'];

  getHelpMessage() {
    return 'Ollama model commands: --list, --show <model>, --pull <model>, --delete <model>'
  }
}

/**
 * Ollama LLM Provider for llmctrlx
 * Wraps the Ollama client for local LLM execution
 */

import { Ollama } from 'ollama'

export class OllamaProvider {
  constructor(opts) {
    this.client = new Ollama(opts)
  }

  async chat(args) {
    return this.client.chat(args)
  }

  async embeddings(args) {
    return this.client.embeddings(args)
  }

  async list() {
    return this.client.list()
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
}

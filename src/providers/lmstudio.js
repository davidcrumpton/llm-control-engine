/**
 * LM Studio LLM Provider for llmctrlx
 * Wraps the LM Studio OpenAI-compatible API
 */

import fetch from 'node-fetch'

export class LMStudioProvider {
  constructor({ host }) {
    this.host = host || 'http://127.0.0.1:1234/v1'
  }

  async chat({ model, messages, stream }) {
    const res = await fetch(`${this.host}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream })
    })

    if (stream) {
      throw new Error('Streaming not yet supported for LM Studio')
    }

    const data = await res.json()

    return {
      message: {
        content: data.choices[0].message.content
      }
    }
  }

  async embeddings({ model, prompt }) {
    const res = await fetch(`${this.host}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: prompt
      })
    })

    const data = await res.json()

    return {
      embedding: data.data[0].embedding
    }
  }

  async list() {
    const res = await fetch(`${this.host}/models`)
    const data = await res.json()
    return { models: data.data }
  }

  async show() {
    throw new Error('LM Studio does not support show()')
  }

  async pull() {
    throw new Error('LM Studio does not support pull()')
  }

  async delete() {
    throw new Error('LM Studio does not support delete()')
  }
}

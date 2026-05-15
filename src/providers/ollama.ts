/**
 * Ollama LLM Provider for llmctrlx
 *
 * Wraps the Ollama client for local LLM execution with proper type safety.
 */

import { Ollama } from 'ollama'
import {
  LLMProvider,
  LLMResponse,
  ChatParams,
  LLMMessage,
  MessageContent,
} from '../types.js'

export class OllamaProvider implements LLMProvider {
  static readonly DEFAULT_HOST = 'http://127.0.0.1:11434'
  static readonly DEFAULT_MODEL = 'gemma4:e2b'

  readonly defaultModel: string
  readonly capabilities: string[] = ['list', 'show', 'pull', 'delete']
  private client: Ollama

  constructor(opts: Record<string, unknown> = {}) {
    // Use caller-supplied host only when explicitly provided; fall back to
    // this provider's own default so callers never need to know the port.
    const host =
      (typeof opts.host === 'string' && opts.host) ||
      OllamaProvider.DEFAULT_HOST
    this.defaultModel = OllamaProvider.DEFAULT_MODEL

    // Custom fetch with timeout settings
    const timeoutMs = (Number(opts.timeout) || 480) * 1000
    const customFetch = (input: RequestInfo, init?: RequestInit) => {
      return fetch(input, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      })
    }

    this.client = new Ollama({
      ...(opts as any),
      host,
      fetch: customFetch,
    })
  }

  async chat(args: ChatParams): Promise<LLMResponse> {
    // Normalize messages for Ollama API compatibility
    // Ollama expects content as string, not array
    let messages = args.messages
    if (messages) {
      messages = messages.map((msg) => {
        const newMsg = { ...msg }
        if (Array.isArray(newMsg.content)) {
          // Flatten array content to string
          newMsg.content = (newMsg.content as MessageContent[])
            .map((part) =>
              typeof part === 'string'
                ? part
                : (part as any).text || ''
            )
            .join('')
        }
        return newMsg as any
      })
    }
    return this.client.chat({ ...args, messages: messages as any })
  }

  async embeddings(
    args: Record<string, unknown>
  ): Promise<{ embedding?: number[] }> {
    const { model, prompt } = args as {
      model: string
      prompt: string
    }
    return this.client.embeddings({ model, prompt } as any)
  }

  async list(): Promise<{ models: string[] }> {
    const res = await this.client.list()
    // extract only model name
    return { models: (res as any).models.map((m: any) => m.name) }
  }

  async show(args: { model: string }): Promise<unknown> {
    return this.client.show(args)
  }

  async pull(args: { model: string }): Promise<void> {
    await this.client.pull(args as any)
  }

  async delete(args: { model: string }): Promise<void> {
    await this.client.delete(args as any)
  }

  getHelpMessage(): string {
    throw new Error(
      'Ollama model commands: --list, --show <model>, --pull <model>, --delete <model>'
    )
  }
}

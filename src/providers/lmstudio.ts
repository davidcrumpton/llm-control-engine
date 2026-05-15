/**
 * LM Studio LLM Provider for llmctrlx
 *
 * Security hardening:
 *   - All API responses are validated before property access.
 *     A malformed, empty, or error response no longer throws an uncaught
 *     TypeError that exposes internal stack-trace information.
 *   - HTTP-level errors (non-2xx status codes) are now surfaced as
 *     descriptive Error objects rather than silently producing garbage.
 *   - The `host` constructor option is validated to be a well-formed http/https
 *     URL, preventing accidental SSRF via a misconfigured host string.
 */

import {
  LLMProvider,
  LLMResponse,
  ChatParams,
} from '../types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Assert that `response.ok` is true. Throws a descriptive error otherwise
 * so callers don't silently receive an error payload masquerading as data.
 */
async function assertOk(res: Response, endpoint: string): Promise<void> {
  if (!res.ok) {
    let body = ''
    try {
      body = await res.text()
    } catch {
      /* ignore */
    }
    throw new Error(
      `LM Studio API error at '${endpoint}': HTTP ${res.status} ${res.statusText}` +
        (body ? ` — ${body.slice(0, 200)}` : '')
    )
  }
}

/**
 * Validate that `data` looks like a well-formed chat completion response.
 * Throws a descriptive error rather than letting downstream code hit
 * a TypeError from accessing undefined properties.
 */
function parseChatResponse(data: unknown): LLMResponse {
  if (
    data === null ||
    typeof data !== 'object' ||
    !Array.isArray((data as any).choices) ||
    (data as any).choices.length === 0
  ) {
    throw new Error(
      'LM Studio chat response is missing or has no choices. ' +
        `Got: ${JSON.stringify(data)?.slice(0, 200)}`
    )
  }

  const choice = (data as any).choices[0]
  if (
    !choice ||
    typeof choice !== 'object' ||
    !choice.message ||
    typeof choice.message.content !== 'string'
  ) {
    throw new Error(
      'LM Studio chat response choice is malformed (missing message.content). ' +
        `Got: ${JSON.stringify(choice)?.slice(0, 200)}`
    )
  }

  return { message: { content: choice.message.content } }
}

/**
 * Validate that `data` looks like a well-formed embeddings response.
 */
function parseEmbeddingsResponse(
  data: unknown
): { embedding: number[] } {
  if (
    data === null ||
    typeof data !== 'object' ||
    !Array.isArray((data as any).data) ||
    (data as any).data.length === 0
  ) {
    throw new Error(
      'LM Studio embeddings response is missing or has no data. ' +
        `Got: ${JSON.stringify(data)?.slice(0, 200)}`
    )
  }

  const item = (data as any).data[0]
  if (!item || !Array.isArray(item.embedding)) {
    throw new Error(
      'LM Studio embeddings response item is malformed (missing embedding array). ' +
        `Got: ${JSON.stringify(item)?.slice(0, 200)}`
    )
  }

  return { embedding: item.embedding }
}

/**
 * Validate and normalise a host string.
 * Must be an http or https URL; trailing slashes are stripped.
 */
function validateHost(host: string): string {
  let url: URL
  try {
    url = new URL(host)
  } catch {
    throw new Error(
      `LMStudioProvider: invalid host URL '${host}'.`
    )
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `LMStudioProvider: host must use http or https, got '${url.protocol}'.`
    )
  }

  return url.toString().replace(/\/$/, '')
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class LMStudioProvider implements LLMProvider {
  static readonly DEFAULT_HOST = 'http://127.0.0.1:1234/v1'
  static readonly DEFAULT_MODEL = 'google/gemma-4-e2b'

  readonly defaultModel: string
  readonly capabilities: string[] = ['list']
  private host: string
  private timeout: number

  constructor(opts: Record<string, unknown> = {}) {
    const { host, timeout } = opts as any
    // Use caller-supplied host only when explicitly provided; fall back to
    // this provider's own default so callers never need to know the port.
    this.host = validateHost(
      (typeof host === 'string' && host) ||
        LMStudioProvider.DEFAULT_HOST
    )
    this.defaultModel = LMStudioProvider.DEFAULT_MODEL
    this.timeout = typeof timeout === 'number' ? timeout : 480
  }

  async chat(args: ChatParams): Promise<LLMResponse> {
    const { model, messages, stream } = args

    if (stream) {
      throw new Error('Streaming not yet supported for LM Studio')
    }

    const res = await fetch(`${this.host}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream }),
      signal: AbortSignal.timeout(this.timeout * 1000),
    })

    await assertOk(res, '/chat/completions')
    const data = await res.json()
    return parseChatResponse(data)
  }

  async embeddings(args: Record<string, unknown>): Promise<{ embedding: number[] }> {
    const { model, prompt } = args as {
      model: string
      prompt: string
    }

    const res = await fetch(`${this.host}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: prompt }),
      signal: AbortSignal.timeout(this.timeout * 1000),
    })

    await assertOk(res, '/embeddings')
    const data = await res.json()
    return parseEmbeddingsResponse(data)
  }

  async list(): Promise<{ models: string[] }> {
    const res = await fetch(`${this.host}/models`, {
      signal: AbortSignal.timeout(this.timeout * 1000),
    })
    await assertOk(res, '/models')
    const data = await res.json()

    if (
      data === null ||
      typeof data !== 'object' ||
      !Array.isArray((data as any).data) ||
      (data as any).data.length === 0
    ) {
      throw new Error(
        'LM Studio models response is missing or has no models. ' +
          `Got: ${JSON.stringify(data)?.slice(0, 200)}`
      )
    }
    // we want return list of model names
    return {
      models: (data as any).data.map((model: any) => model['id']),
    }
  }

  async show(): Promise<never> {
    throw new Error('LM Studio does not support show()')
  }

  async pull(): Promise<never> {
    throw new Error('LM Studio does not support pull()')
  }

  async delete(): Promise<never> {
    throw new Error('LM Studio does not support delete()')
  }

  getHelpMessage(): string {
    throw new Error('LM Studio model commands: --list')
  }
}

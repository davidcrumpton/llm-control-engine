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

import fetch from 'node-fetch'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Assert that `response.ok` is true.  Throws a descriptive error otherwise
 * so callers don't silently receive an error payload masquerading as data.
 *
 * @param {import('node-fetch').Response} res
 * @param {string} endpoint - Label for error messages.
 */
async function assertOk(res, endpoint) {
  if (!res.ok) {
    let body = ''
    try { body = await res.text() } catch { /* ignore */ }
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
 *
 * @param {unknown} data
 * @returns {{ message: { content: string } }}
 */
function parseChatResponse(data) {
  if (
    data === null ||
    typeof data !== 'object' ||
    !Array.isArray(data.choices) ||
    data.choices.length === 0
  ) {
    throw new Error(
      'LM Studio chat response is missing or has no choices. ' +
      `Got: ${JSON.stringify(data)?.slice(0, 200)}`
    )
  }

  const choice = data.choices[0]
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
 *
 * @param {unknown} data
 * @returns {{ embedding: number[] }}
 */
function parseEmbeddingsResponse(data) {
  if (
    data === null ||
    typeof data !== 'object' ||
    !Array.isArray(data.data) ||
    data.data.length === 0
  ) {
    throw new Error(
      'LM Studio embeddings response is missing or has no data. ' +
      `Got: ${JSON.stringify(data)?.slice(0, 200)}`
    )
  }

  const item = data.data[0]
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
 *
 * @param {string} host
 * @returns {string} Normalised base URL without trailing slash.
 */
function validateHost(host) {
  let url
  try {
    url = new URL(host)
  } catch {
    throw new Error(`LMStudioProvider: invalid host URL '${host}'.`)
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

export class LMStudioProvider {
  static DEFAULT_HOST  = 'http://127.0.0.1:1234/v1'
  static DEFAULT_MODEL = 'google/gemma-4-e2b'

  constructor({ host } = {}) {
    // Use caller-supplied host only when explicitly provided; fall back to
    // this provider's own default so callers never need to know the port.
    this.host = validateHost(host || LMStudioProvider.DEFAULT_HOST)
    this.defaultModel = LMStudioProvider.DEFAULT_MODEL
  }

  async chat({ model, messages, stream }) {
    if (stream) {
      throw new Error('Streaming not yet supported for LM Studio')
    }

    const res = await fetch(`${this.host}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream }),
    })

    await assertOk(res, '/chat/completions')
    const data = await res.json()
    return parseChatResponse(data)
  }

  async embeddings({ model, prompt }) {
    const res = await fetch(`${this.host}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: prompt }),
    })

    await assertOk(res, '/embeddings')
    const data = await res.json()
    return parseEmbeddingsResponse(data)
  }

  async list() {
    const res = await fetch(`${this.host}/models`)
    await assertOk(res, '/models')
    const data = await res.json()

    if (
      data === null ||
      typeof data !== 'object' ||
      !Array.isArray(data.data) ||
      data.data.length === 0
    ) {
      throw new Error(
        'LM Studio models response is missing or has no models. ' +
        `Got: ${JSON.stringify(data)?.slice(0, 200)}`
      )
    }
    // we want return list of model names
    return { models: data.data.map(model => model['id']) }
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

  capabilities = ['list'];

  getHelpMessage() {
    return 'LM Studio model commands: --list'
  }
}
/**
 * OpenAI LLM Provider for llmctrlx
 *
 * Supports the OpenAI Chat Completions API (and any compatible endpoint,
 * e.g. Azure OpenAI, LiteLLM, LocalAI, vLLM) using raw `fetch` so there
 * is no dependency on the `openai` npm package at runtime.
 *
 * Security hardening (mirrors lmstudio.ts):
 *   - All API responses are validated before property access.
 *   - HTTP-level errors (non-2xx) are surfaced as descriptive Error objects.
 *   - The `host` constructor option is validated to be a well-formed
 *     http/https URL, preventing accidental SSRF via a misconfigured host.
 *   - The API key is never logged or included in error messages.
 */

import {
  LLMProvider,
  LLMResponse,
  ChatParams,
  MessageContent,
} from "../types.js";

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface OpenAIChatChoice {
  index: number;
  message: { role: string; content: string | null };
  finish_reason: string | null;
  delta?: { role?: string; content?: string };
}

interface OpenAIChatResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChatChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OpenAIStreamChunk {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: { role?: string; content?: string };
    finish_reason: string | null;
  }>;
}

interface OpenAIEmbeddingResponse {
  object: string;
  data: Array<{ object: string; embedding: number[]; index: number }>;
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

interface OpenAIModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface OpenAIModelsResponse {
  object: string;
  data: OpenAIModel[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Assert that `response.ok` is true; throw a descriptive error otherwise.
 * Never includes the API key in the error message.
 */
async function assertOk(res: Response, endpoint: string): Promise<void> {
  if (!res.ok) {
    let body = "";
    try {
      body = await res.text();
    } catch {
      /* ignore */
    }
    throw new Error(
      `OpenAI API error at '${endpoint}': HTTP ${res.status} ${res.statusText}` +
        (body ? ` — ${body.slice(0, 300)}` : ""),
    );
  }
}

/**
 * Validate that `data` is a well-formed OpenAI chat completion response.
 */
function parseChatResponse(data: unknown): LLMResponse {
  if (
    data === null ||
    typeof data !== "object" ||
    !Array.isArray((data as any).choices) ||
    (data as any).choices.length === 0
  ) {
    throw new Error(
      "OpenAI chat response is missing or has no choices. " +
        `Got: ${JSON.stringify(data)?.slice(0, 200)}`,
    );
  }

  const typed = data as OpenAIChatResponse;
  const choice = typed.choices[0];

  if (
    !choice ||
    typeof choice !== "object" ||
    !choice.message ||
    typeof choice.message.content !== "string"
  ) {
    throw new Error(
      "OpenAI chat response choice is malformed (missing message.content). " +
        `Got: ${JSON.stringify(choice)?.slice(0, 200)}`,
    );
  }

  return {
    message: { content: choice.message.content },
    eval_count: typed.usage?.completion_tokens,
    prompt_eval_count: typed.usage?.prompt_tokens,
  };
}

/**
 * Validate that `data` is a well-formed OpenAI embeddings response.
 */
function parseEmbeddingsResponse(data: unknown): { embedding: number[] } {
  if (
    data === null ||
    typeof data !== "object" ||
    !Array.isArray((data as any).data) ||
    (data as any).data.length === 0
  ) {
    throw new Error(
      "OpenAI embeddings response is missing or has no data. " +
        `Got: ${JSON.stringify(data)?.slice(0, 200)}`,
    );
  }

  const typed = data as OpenAIEmbeddingResponse;
  const item = typed.data[0];

  if (!item || !Array.isArray(item.embedding)) {
    throw new Error(
      "OpenAI embeddings response item is malformed (missing embedding array). " +
        `Got: ${JSON.stringify(item)?.slice(0, 200)}`,
    );
  }

  return { embedding: item.embedding };
}

/**
 * Validate and normalise a host string to a base URL without trailing slash.
 * Must be http or https.
 */
function validateHost(host: string): string {
  let url: URL;
  try {
    url = new URL(host);
  } catch {
    throw new Error(`OpenAIProvider: invalid host URL '${host}'.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      `OpenAIProvider: host must use http or https, got '${url.protocol}'.`,
    );
  }

  return url.toString().replace(/\/$/, "");
}

/**
 * Normalise a single message's content to a string.
 * OpenAI's API accepts string content only (not content arrays at the
 * provider level), so we flatten MessageContent[] → string here.
 */
function normaliseContent(
  content: string | MessageContent[] | undefined,
): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string" ? part : ((part as any).text ?? ""),
      )
      .join("");
  }
  return "";
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export class OpenAIProvider implements LLMProvider {
  static readonly DEFAULT_HOST = "https://api.openai.com/v1";
  static readonly DEFAULT_MODEL = "gpt-4o-mini";

  readonly defaultModel: string;
  /** OpenAI supports listing models; show/pull/delete are not applicable. */
  readonly capabilities: string[] = ["list"];

  private host: string;
  private apiKey: string;
  private timeout: number;

  constructor(opts: Record<string, unknown> = {}) {
    const { host, apiKey, timeout } = opts as {
      host?: string;
      apiKey?: string;
      timeout?: number;
    };

    this.host = validateHost(
      (typeof host === "string" && host) || OpenAIProvider.DEFAULT_HOST,
    );
    this.apiKey = typeof apiKey === "string" ? apiKey : "";
    this.defaultModel = OpenAIProvider.DEFAULT_MODEL;
    this.timeout = typeof timeout === "number" ? timeout : 480;
  }

  // -- Private helpers -------------------------------------------------------

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      h["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return h;
  }

  // -- LLMProvider implementation --------------------------------------------

  async chat(
    args: ChatParams,
  ): Promise<LLMResponse | AsyncIterable<LLMResponse>> {
    const { model, messages, stream, options: _opts } = args;

    // Normalise message contents before sending
    const normalisedMessages = (messages ?? []).map((msg) => ({
      role: msg.role,
      content: normaliseContent(msg.content as string | MessageContent[]),
    }));

    const body: Record<string, unknown> = {
      model,
      messages: normalisedMessages,
      stream: stream ?? false,
    };

    // Forward supported options
    const opts = (_opts ?? {}) as Record<string, unknown>;
    if (opts.temperature !== undefined) body.temperature = opts.temperature;
    if (opts.top_p !== undefined) body.top_p = opts.top_p;
    if (opts.max_tokens !== undefined) body.max_tokens = opts.max_tokens;

    const endpoint = `${this.host}/chat/completions`;

    if (stream) {
      return this.streamChat(endpoint, body);
    }

    const res = await fetch(endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(this.timeout * 1000),
    });

    await assertOk(res, "/chat/completions");
    const data = await res.json();
    return parseChatResponse(data);
  }

  /**
   * Return an AsyncIterable that yields LLMResponse chunks from the SSE stream.
   * Each chunk contains the partial `message.content` delta.
   */
  private async *streamChat(
    endpoint: string,
    body: Record<string, unknown>,
  ): AsyncIterable<LLMResponse> {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ ...body, stream: true }),
      signal: AbortSignal.timeout(this.timeout * 1000),
    });

    await assertOk(res, "/chat/completions (stream)");

    if (!res.body) {
      throw new Error("OpenAI stream response has no body.");
    }

    const decoder = new TextDecoder("utf-8");
    const reader = res.body.getReader();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        // Keep the last (possibly incomplete) line in the buffer
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          if (!trimmed.startsWith("data: ")) continue;

          const jsonStr = trimmed.slice(6); // strip "data: "
          let chunk: OpenAIStreamChunk;
          try {
            chunk = JSON.parse(jsonStr);
          } catch {
            continue; // skip malformed chunks
          }

          const delta = chunk.choices?.[0]?.delta;
          if (delta?.content) {
            yield { message: { content: delta.content } };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async embeddings(
    args: Record<string, unknown>,
  ): Promise<{ embedding: number[] }> {
    const { model, prompt } = args as { model: string; prompt: string };

    const res = await fetch(`${this.host}/embeddings`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({ model, input: prompt }),
      signal: AbortSignal.timeout(this.timeout * 1000),
    });

    await assertOk(res, "/embeddings");
    const data = await res.json();
    return parseEmbeddingsResponse(data);
  }

  async list(): Promise<{ models: string[] }> {
    const res = await fetch(`${this.host}/models`, {
      headers: this.headers(),
      signal: AbortSignal.timeout(this.timeout * 1000),
    });

    await assertOk(res, "/models");
    const data = (await res.json()) as OpenAIModelsResponse;

    if (
      data === null ||
      typeof data !== "object" ||
      !Array.isArray(data.data)
    ) {
      throw new Error(
        "OpenAI models response is missing or malformed. " +
          `Got: ${JSON.stringify(data)?.slice(0, 200)}`,
      );
    }

    // Sort alphabetically for readability
    const names = data.data
      .map((m) => m.id)
      .filter(Boolean)
      .sort();

    return { models: names };
  }

  async show(): Promise<never> {
    throw new Error("OpenAI does not support show()");
  }

  async pull(): Promise<never> {
    throw new Error("OpenAI does not support pull()");
  }

  async delete(): Promise<never> {
    throw new Error("OpenAI does not support delete()");
  }

  getHelpMessage(): string {
    return "OpenAI model commands: --list";
  }
}

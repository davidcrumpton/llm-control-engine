/// tests/fixtures/providers/mock-responses.ts

export const OPENAI_CHAT_COMPLETION = {
  id: "chatcmpl-test-123",
  object: "chat.completion",
  created: 1700000000,
  model: "gpt-4",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: "Hello from OpenAI mock",
      },
      finish_reason: "stop",
    },
  ],
  usage: {
    prompt_tokens: 10,
    completion_tokens: 15,
    total_tokens: 25,
  },
};

export const OPENAI_STREAM_CHUNKS = [
  { choices: [{ delta: { role: "assistant" }, index: 0 }] },
  { choices: [{ delta: { content: "Hello " }, index: 0 }] },
  { choices: [{ delta: { content: "world" }, index: 0 }] },
  { choices: [{ delta: {}, finish_reason: "stop", index: 0 }] },
];

export const OPENAI_TOOL_CALL_RESPONSE = {
  id: "chatcmpl-tool-456",
  object: "chat.completion",
  created: 1700000000,
  model: "gpt-4",
  choices: [
    {
      index: 0,
      message: {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_abc123",
            type: "function",
            function: {
              name: "get_weather",
              arguments: '{"location":"Denver, CO"}',
            },
          },
        ],
      },
      finish_reason: "tool_calls",
    },
  ],
  usage: {
    prompt_tokens: 20,
    completion_tokens: 30,
    total_tokens: 50,
  },
};

export const ANTHROPIC_MESSAGE_RESPONSE = {
  id: "msg-test-789",
  type: "message",
  role: "assistant",
  content: [{ type: "text", text: "Hello from Anthropic mock" }],
  model: "claude-3-opus-20240229",
  stop_reason: "end_turn",
  usage: { input_tokens: 12, output_tokens: 18 },
};

export const ANTHROPIC_TOOL_USE_RESPONSE = {
  id: "msg-tool-101",
  type: "message",
  role: "assistant",
  content: [
    {
      type: "tool_use",
      id: "toolu_xyz789",
      name: "get_weather",
      input: { location: "Denver, CO" },
    },
  ],
  model: "claude-3-opus-20240229",
  stop_reason: "tool_use",
  usage: { input_tokens: 15, output_tokens: 25 },
};

export const OLLAMA_GENERATE_RESPONSE = {
  model: "llama3",
  created_at: "2024-01-01T00:00:00Z",
  response: "Hello from Ollama mock",
  done: true,
  total_duration: 500000000,
  eval_count: 20,
  eval_duration: 400000000,
};

export const OLLAMA_CHAT_RESPONSE = {
  model: "llama3",
  created_at: "2024-01-01T00:00:00Z",
  message: {
    role: "assistant",
    content: "Hello from Ollama chat mock",
  },
  done: true,
  total_duration: 500000000,
  eval_count: 20,
  eval_duration: 400000000,
};

export const PROVIDER_ERROR_RESPONSES = {
  rateLimited: {
    status: 429,
    message: "Rate limit exceeded",
    retryAfter: 60,
  },
  unauthorized: {
    status: 401,
    message: "Invalid API key",
  },
  serverError: {
    status: 500,
    message: "Internal server error",
  },
  timeout: {
    code: "ETIMEDOUT",
    message: "Request timed out",
  },
  networkError: {
    code: "ECONNREFUSED",
    message: "Connection refused",
  },
};

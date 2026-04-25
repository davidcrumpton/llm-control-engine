/// tests/helpers/test-utils.ts
import { vi } from 'vitest';

/**
 * Creates a mock LLM provider with configurable responses.
 */
export function createMockProvider(overrides: Record<string, any> = {}) {
  return {
    name: 'mock-provider',
    initialize: vi.fn().mockResolvedValue(undefined),
    complete: vi.fn().mockResolvedValue({
      content: 'Mock response',
      usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      model: 'mock-model',
      finishReason: 'stop',
    }),
    stream: vi.fn().mockImplementation(async function* () {
      yield { content: 'Mock ', done: false };
      yield { content: 'streamed ', done: false };
      yield { content: 'response', done: true };
    }),
    listModels: vi.fn().mockResolvedValue(['mock-model-1', 'mock-model-2']),
    isAvailable: vi.fn().mockResolvedValue(true),
    shutdown: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/**
 * Creates a mock tool definition for dynamic loader tests.
 */
export function createMockTool(name: string, overrides: Record<string, any> = {}) {
  return {
    name,
    description: `Mock tool: ${name}`,
    parameters: {
      type: 'object' as const,
      properties: {
        input: { type: 'string', description: 'Tool input' },
      },
      required: ['input'],
    },
    execute: vi.fn().mockResolvedValue({ result: `${name} executed` }),
    ...overrides,
  };
}

/**
 * Creates a minimal engine config for tests.
 */
export function createTestConfig(overrides: Record<string, any> = {}) {
  return {
    provider: 'mock',
    model: 'mock-model',
    temperature: 0.7,
    maxTokens: 1024,
    tools: {
      directory: './tools',
      autoload: true,
    },
    logging: {
      level: 'silent',
      format: 'json',
    },
    ...overrides,
  };
}

/**
 * Waits for all pending promises to resolve.
 * Useful after triggering async operations.
 */
export async function flushPromises() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
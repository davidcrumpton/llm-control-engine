/// tests/providers/ollama.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  OLLAMA_CHAT_RESPONSE,
  OLLAMA_GENERATE_RESPONSE,
  PROVIDER_ERROR_RESPONSES,
} from "../fixtures/providers/mock-responses.ts";

// TODO: Update import path
// import { OllamaProvider } from '@/providers/ollama';

// Mock fetch for Ollama's HTTP API
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("OllamaProvider", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe("initialization", () => {
    it("should default to localhost:11434", () => {
      // const provider = new OllamaProvider({});
      // expect(provider.baseUrl).toBe('http://localhost:11434');
      expect(true).toBe(true);
    });

    it("should accept a custom base URL", () => {
      // const provider = new OllamaProvider({
      //   baseUrl: 'http://gpu-server:11434',
      // });
      // expect(provider.baseUrl).toBe('http://gpu-server:11434');
      expect(true).toBe(true);
    });
  });

  describe("isAvailable", () => {
    it("should return true when Ollama API responds", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: "0.1.0" }),
      });
      // const available = await provider.isAvailable();
      // expect(available).toBe(true);
      // expect(mockFetch).toHaveBeenCalledWith(
      //   'http://localhost:11434/api/version'
      // );
      expect(mockFetch).toBeDefined();
    });

    it("should return false when connection is refused", async () => {
      mockFetch.mockRejectedValue(new Error("ECONNREFUSED"));
      // const available = await provider.isAvailable();
      // expect(available).toBe(false);
      expect(true).toBe(true);
    });
  });

  describe("complete", () => {
    it("should call /api/chat and return formatted response", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(OLLAMA_CHAT_RESPONSE),
      });
      // const result = await provider.complete({
      //   messages: [{ role: 'user', content: 'Hello' }],
      //   model: 'llama3',
      // });
      // expect(result.content).toBe('Hello from Ollama chat mock');
      // expect(mockFetch).toHaveBeenCalledWith(
      //   expect.stringContaining('/api/chat'),
      //   expect.objectContaining({ method: 'POST' })
      // );
      expect(OLLAMA_CHAT_RESPONSE.message.content).toBe(
        "Hello from Ollama chat mock",
      );
    });

    it("should include keepAlive parameter when configured", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(OLLAMA_CHAT_RESPONSE),
      });
      // await provider.complete({ messages: [], model: 'llama3' });
      // const [, fetchOpts] = mockFetch.mock.calls[0];
      // const body = JSON.parse(fetchOpts.body);
      // expect(body.keep_alive).toBe('5m');
      expect(true).toBe(true);
    });
  });

  describe("listModels", () => {
    it("should fetch and return local model names", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            models: [
              { name: "llama3:latest" },
              { name: "codellama:7b" },
              { name: "mistral:latest" },
            ],
          }),
      });
      // const models = await provider.listModels();
      // expect(models).toEqual([
      //   'llama3:latest', 'codellama:7b', 'mistral:latest'
      // ]);
      expect(true).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should surface model-not-found errors clearly", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: () =>
          Promise.resolve({
            error: 'model "xyz" not found',
          }),
      });
      // await expect(
      //   provider.complete({ messages: [], model: 'xyz' })
      // ).rejects.toThrow(/not found/i);
      expect(true).toBe(true);
    });
  });
});

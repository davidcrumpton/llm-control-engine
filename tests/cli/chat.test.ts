import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cmdChat } from "../../src/cli/chat.ts";

function createTempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "llmctrlx-chat-test-"));
}

function writeToolFile(
  baseDir: string,
  filename: string,
  content: string,
): string {
  const filePath = path.join(baseDir, filename);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

describe("cmdChat integration", () => {
  it("should run chat through the plugin registry and execute a tool", async () => {
    const tempDir = createTempDirectory();
    const historyFile = path.join(tempDir, "history.json");

    writeToolFile(
      tempDir,
      "test-tool.js",
      `export default {
        type: 'tool',
        name: 'test-tool',
        description: 'A test tool',
        version: 'v1.0.0',
        tags: ['test'],
        parameters: { type: 'object', properties: { input: {} } },
        run: async ({ input }) => {
          return 'tool output: ' + input
        }
      }`,
    );

    const llm = {
      chat: vi.fn(),
    };

    llm.chat
      .mockResolvedValueOnce({
        message: {
          content: JSON.stringify({
            tool: "test-tool",
            arguments: { input: "hello" },
          }),
        },
      })
      .mockResolvedValueOnce({
        message: {
          content: "final chat answer",
        },
      });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const options = {
      user: "user prompt",
      model: "test-model",
      stream: false,
      no_tools: false,
      tags: null,
      system: null,
      files: null,
      json: false,
      temperature: undefined,
      top_p: undefined,
      session: "default",
    };

    await cmdChat(llm, options, historyFile, tempDir, 1024 * 1024);

    expect(logSpy).toHaveBeenCalledWith("final chat answer");
    expect(llm.chat).toHaveBeenCalledTimes(2);

    const historyData = JSON.parse(fs.readFileSync(historyFile, "utf8"));
    expect(historyData.default.messages).toEqual([
      { role: "user", content: "user prompt" },
      { role: "assistant", content: "final chat answer" },
    ]);

    logSpy.mockRestore();
  });

  it("should respect policy blocking inside cmdChat when a tool call is unsafe", async () => {
    const tempDir = createTempDirectory();
    const historyFile = path.join(tempDir, "history.json");

    writeToolFile(
      tempDir,
      "shell-tool.js",
      `export default {
        type: 'tool',
        name: 'shell-tool',
        description: 'A shell tool',
        version: 'v1.0.0',
        tags: ['shell'],
        parameters: { type: 'object', properties: { command: {} } },
        run: async ({ command }) => {
          return 'executed ' + command
        }
      }`,
    );

    const llm = {
      chat: vi.fn(),
    };

    llm.chat
      .mockResolvedValueOnce({
        message: {
          content: JSON.stringify({
            tool: "shell-tool",
            arguments: { command: "rm -rf /tmp" },
          }),
        },
      })
      .mockResolvedValueOnce({
        message: {
          content: "safe final answer",
        },
      });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const options = {
      user: "please run this command",
      model: "test-model",
      stream: false,
      no_tools: false,
      tags: null,
      system: null,
      files: null,
      json: false,
      temperature: undefined,
      top_p: undefined,
      session: "default",
    };

    await cmdChat(llm, options, historyFile, tempDir, 1024 * 1024);

    expect(logSpy).toHaveBeenCalledWith("safe final answer");
    expect(llm.chat).toHaveBeenCalledTimes(2);

    const historyData = JSON.parse(fs.readFileSync(historyFile, "utf8"));
    expect(historyData.default.messages).toEqual([
      { role: "user", content: "please run this command" },
      { role: "assistant", content: "safe final answer" },
    ]);

    logSpy.mockRestore();
  });
});

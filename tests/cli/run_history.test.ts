import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cmdRun } from "../../src/cli/run.js";

function createTempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "llmctrlx-run-history-test-"));
}

describe("cmdRun history integration", () => {
  it("should persist interaction to history and use it in subsequent calls", async () => {
    const tempDir = createTempDirectory();
    const historyFile = path.join(tempDir, "history.json");

    const llm = {
      chat: vi.fn(),
    };

    llm.chat.mockResolvedValue({
      message: {
        content: "analysis result",
      },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const options = {
      user: "echo hello",
      model: "test-model",
      session: "test-session",
      history_length: 5,
    };

    const engineHooks = {
      gateInference: vi.fn().mockResolvedValue({ allowed: true }),
      filterResponse: vi
        .fn()
        .mockImplementation((_, { content }) => ({ content })),
    };

    // First run
    await cmdRun(llm as any, options as any, historyFile, engineHooks as any);

    expect(llm.chat).toHaveBeenCalledTimes(1);
    const firstCallMessages = llm.chat.mock.calls[0][0].messages;
    expect(firstCallMessages[0].role).toBe("system");
    expect(firstCallMessages[1].content).toContain("echo hello");
    expect(firstCallMessages[1].content).toContain("hello");
    expect(firstCallMessages[1].content).toContain("```");

    // Verify history saved
    const historyData = JSON.parse(fs.readFileSync(historyFile, "utf8"));
    expect(historyData["test-session"].messages.length).toBe(2);
    expect(historyData["test-session"].messages[1].content).toBe(
      "analysis result",
    );

    // Second run
    llm.chat.mockClear();
    await cmdRun(llm as any, options as any, historyFile, engineHooks as any);

    expect(llm.chat).toHaveBeenCalledTimes(1);
    const secondCallMessages = llm.chat.mock.calls[0][0].messages;

    // Should contain: 1 system + 2 history + 1 new user message = 4
    expect(secondCallMessages.length).toBe(4);
    expect(secondCallMessages[0].role).toBe("system");
    expect(secondCallMessages[1].content).toContain("echo hello");
    expect(secondCallMessages[2].content).toBe("analysis result");
    expect(secondCallMessages[3].content).toContain("echo hello");

    logSpy.mockRestore();
  });
});

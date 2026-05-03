import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cmdChat } from "@/cli/chat.js";
import { cmdReplay } from "@/cli/replay.js";

function createTempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "llmctrlx-replay-test-"));
}

describe("Recording and Replay", () => {
  let tempDir: string;
  let historyFile: string;
  let recordFile: string;
  let toolsDir: string;

  beforeEach(() => {
    tempDir = createTempDirectory();
    historyFile = path.join(tempDir, "history.json");
    recordFile = path.join(tempDir, "session.json");
    toolsDir = path.join(tempDir, "tools");
    if (!fs.existsSync(toolsDir)) fs.mkdirSync(toolsDir);
  });

  it("should record a chat session and then replay it (playback)", async () => {
    const llm = {
      chat: vi.fn().mockResolvedValue({
        message: { content: "I am a recorded response" },
      }),
    };

    const chatOptions = {
      user: "hello recorder",
      model: "test-model",
      record: recordFile,
      session: "default",
      history_length: 5,
    };

    // 1. Record
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await cmdChat(llm, chatOptions, historyFile, toolsDir, 1024 * 1024, {});

    expect(fs.existsSync(recordFile)).toBe(true);
    const sessionData = JSON.parse(fs.readFileSync(recordFile, "utf8"));
    expect(sessionData.command_type).toBe("chat");
    expect(sessionData.outputs.llmResponse).toBe("I am a recorded response");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[record] session saved"),
    );

    // 2. Replay (Playback)
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const replayOptions = {
      _: [recordFile],
      diff: false,
    };

    await cmdReplay(llm, replayOptions, toolsDir);

    expect(consoleLogSpy).toHaveBeenCalledWith("I am a recorded response");
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[replay] playback"),
    );

    consoleErrorSpy.mockRestore();
    consoleLogSpy.mockRestore();
  });

  it("should verify a reproducible session with --diff", async () => {
    const llm = {
      chat: vi.fn().mockResolvedValue({
        message: { content: "identical response" },
      }),
    };

    const chatOptions = {
      user: "diff test",
      model: "test-model",
      record: recordFile,
    };

    // Record
    vi.spyOn(console, "error").mockImplementation(() => {});
    await cmdChat(llm, chatOptions, historyFile, toolsDir, 1024 * 1024, {});

    // Replay with --diff (Reproducible)
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const replayOptions = {
      _: [recordFile],
      diff: true,
    };

    await cmdReplay(llm, replayOptions, toolsDir);

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("VERDICT: ✓ REPRODUCIBLE");
    expect(process.exitCode).toBeUndefined(); // Success

    consoleLogSpy.mockRestore();
  });

  it("should detect differences in --diff mode", async () => {
    const llm = {
      chat: vi
        .fn()
        .mockResolvedValueOnce({ message: { content: "original response" } }) // For recording
        .mockResolvedValueOnce({ message: { content: "different response" } }), // For re-execution
    };

    const chatOptions = {
      user: "diff mismatch test",
      model: "test-model",
      record: recordFile,
    };

    // Record
    vi.spyOn(console, "error").mockImplementation(() => {});
    await cmdChat(llm, chatOptions, historyFile, toolsDir, 1024 * 1024, {});

    // Replay with --diff (Divergent)
    const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const replayOptions = {
      _: [recordFile],
      diff: true,
    };

    await cmdReplay(llm, replayOptions, toolsDir);

    const output = consoleLogSpy.mock.calls.map((call) => call[0]).join("\n");
    expect(output).toContain("VERDICT: ✗ DIFFERENCES FOUND");
    expect(output).toContain("- original response");
    expect(output).toContain("+ different response");
    expect(process.exitCode).toBe(2);

    consoleLogSpy.mockRestore();
    // Reset exitCode for other tests
    process.exitCode = undefined;
  });

  it("should fail gracefully if session file is missing", async () => {
    const llm = { chat: vi.fn() };
    const replayOptions = {
      _: ["non-existent.json"],
      diff: false,
    };

    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    await cmdReplay(llm, replayOptions, toolsDir);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to load session"),
    );
    expect(process.exitCode).toBe(1);

    consoleErrorSpy.mockRestore();
    process.exitCode = undefined;
  });
});

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-ignore
import { createPluginRegistry, runWithTools } from "@/core/tools.js";

function createTempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "llmctrlx-plugin-registry-"));
}

function writePluginFile(
  baseDir: string,
  filename: string,
  content: string,
): string {
  const filePath = path.join(baseDir, filename);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

describe("Plugin registry and runtime", () => {
  it("should load a legacy tool file and built-in policy plugin", async () => {
    const tempDir = createTempDirectory();

    writePluginFile(
      tempDir,
      "legacy-shell.js",
      `export default {
        type: 'tool',
        name: 'legacy-shell',
        description: 'Legacy shell wrapper',
        version: 'v1.0.0',
        tags: ['shell'],
        parameters: { type: 'object', properties: { command: {} } },
        run: async ({ command }) => ({ output: command })
      }`,
    );

    const registry = await createPluginRegistry(tempDir);

    expect(registry.has("tool", "legacy-shell")).toBe(true);
    expect(registry.has("policy", "safe-command-execution")).toBe(true);
  });

  it("should enforce the safe-command-execution policy in runWithTools", async () => {
    const tool = {
      type: "tool",
      name: "legacy-shell",
      description: "Legacy shell wrapper",
      version: "v1.0.0",
      tags: ["shell"],
      parameters: { type: "object", properties: { command: {} } },
      run: async ({ command }: { command: any }) => `executed ${command}`,
    };

    const policy = {
      type: "policy",
      name: "safe-command-execution",
      onBeforeToolRun: async ({ tool, args }: { tool: any; args: any }) => {
        if (
          tool.name === "legacy-shell" &&
          typeof args.command === "string" &&
          args.command.includes("rm -rf")
        ) {
          return {
            allow: false,
            message: "blocked by safe command execution policy",
          };
        }
        return null;
      },
    };

    const llm = {
      chat: vi.fn(),
    };

    llm.chat
      .mockResolvedValueOnce({
        message: {
          content: JSON.stringify({
            tool: "legacy-shell",
            arguments: { command: "rm -rf /tmp" },
          }),
        },
      })
      .mockResolvedValueOnce({ message: { content: "final safe answer" } });

    const result = await runWithTools(llm, "test-model", [], [tool], [policy]);

    expect(result).toBe("final safe answer");
    expect(llm.chat).toHaveBeenCalledTimes(2);
  });
});

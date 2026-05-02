import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-ignore
import { createPluginRegistry, loadTools, runWithTools } from "@/core/tools.js";

function writeTempFile(
  baseDir: string,
  filename: string,
  content: string,
): string {
  const filePath = path.join(baseDir, filename);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

describe("Plugin system", () => {
  it("should load legacy tool files and policy plugins into the registry", async () => {
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "llmctrlx-plugin-test-"),
    );

    writeTempFile(
      tempDir,
      "legacy-tool.js",
      `export default {
        type: 'tool',
        name: 'test-legacy',
        description: 'A legacy tool loaded through plugin adapter',
        version: 'v1.0.0',
        tags: ['test'],
        parameters: { type: 'object', properties: {} },
        run: async () => 'legacy result'
      }`,
    );

    writeTempFile(
      tempDir,
      "user-policy.js",
      `export default {
        type: 'policy',
        name: 'test-policy',
        description: 'A test policy plugin',
        onBeforeToolRun: async ({ tool, args }) => {
          if (tool.name === 'test-legacy' && args.block) {
            return { allow: false, message: 'blocked by test policy' }
          }
          return null
        }
      }`,
    );

    const registry = await createPluginRegistry(tempDir, "test");

    expect(registry.has("tool", "test-legacy")).toBe(true);
    expect(registry.has("policy", "test-policy")).toBe(true);

    const filteredTools = await loadTools(tempDir, ["test"]);
    expect(filteredTools.map((tool: any) => tool.name)).toContain(
      "test-legacy",
    );
  });

  it("should enforce policy plugins before tool execution in runWithTools", async () => {
    const tool = {
      type: "tool",
      name: "test-legacy",
      description: "A legacy tool loaded through plugin adapter",
      version: "v1.0.0",
      tags: ["test"],
      parameters: { type: "object", properties: { block: {} } },
      run: async () => "legacy result",
    };

    const policy = {
      type: "policy",
      name: "test-policy",
      onBeforeToolRun: async ({ tool, args }: { tool: any; args: any }) => {
        if (tool.name === "test-legacy" && args.block) {
          return { allow: false, message: "blocked by test policy" };
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
            tool: "test-legacy",
            arguments: { block: true },
          }),
        },
      })
      .mockResolvedValueOnce({ message: { content: "final answer" } });

    const result = await runWithTools(llm, "test-model", [], [tool], [policy]);

    expect(result).toBe("final answer");
    expect(llm.chat).toHaveBeenCalledTimes(2);
  });
});

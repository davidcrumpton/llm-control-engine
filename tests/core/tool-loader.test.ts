/// tests/core/tool-loader.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
// @ts-ignore
import { Registry } from "@/core/registry.js";
// @ts-ignore
import { loadPluginsFromDir } from "@/core/loader.js";
// @ts-ignore
import { validateTool } from "@/core/utils.js";

function createTempDirectory(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "llmctrlx-tool-loader-"));
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

describe("Tool loader", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDirectory();
  });

  it("should discover tool files in the configured directory", async () => {
    writePluginFile(
      tempDir,
      "search.js",
      `export default {
        type: 'tool',
        name: 'search',
        description: 'Search tool',
        version: 'v1.0.0',
        parameters: { type: 'object', properties: {} },
        run: async () => 'search result'
      }`,
    );

    writePluginFile(
      tempDir,
      "calculator.js",
      `export default {
        type: 'tool',
        name: 'calculator',
        description: 'Calculator tool',
        version: 'v1.0.0',
        parameters: { type: 'object', properties: {} },
        run: async () => '42'
      }`,
    );

    fs.writeFileSync(
      path.join(tempDir, "README.md"),
      "# Tools directory",
      "utf8",
    );

    const registry = new Registry();
    await loadPluginsFromDir(tempDir, registry, {});

    const loaded = registry.list("tool").map((tool: any) => tool.name);
    expect(loaded).toEqual(expect.arrayContaining(["search", "calculator"]));
    expect(loaded).toHaveLength(2);
  });

  it("should ignore non-JavaScript files while loading valid tools", async () => {
    writePluginFile(
      tempDir,
      "valid-tool.js",
      `export default {
        type: 'tool',
        name: 'valid-tool',
        description: 'Valid tool',
        version: 'v1.0.0',
        parameters: { type: 'object', properties: {} },
        run: async () => 'ok'
      }`,
    );

    fs.writeFileSync(path.join(tempDir, "notes.txt"), "some notes", "utf8");
    fs.writeFileSync(path.join(tempDir, "data.json"), "{}", "utf8");

    const registry = new Registry();
    await loadPluginsFromDir(tempDir, registry, {});

    const tools = registry.list("tool").map((tool: any) => tool.name);
    expect(tools).toEqual(["valid-tool"]);
  });

  it("should handle an empty tools directory", async () => {
    const registry = new Registry();
    await loadPluginsFromDir(tempDir, registry, {});

    expect(registry.list("tool")).toHaveLength(0);
  });

  it("should gracefully handle a missing tools directory", async () => {
    const missingDir = path.join(tempDir, "missing");
    const registry = new Registry();

    await expect(
      loadPluginsFromDir(missingDir, registry, {}),
    ).resolves.toBeUndefined();
    expect(registry.list("tool")).toHaveLength(0);
  });

  it("should load nested plugin directories recursively", async () => {
    const nestedDir = path.join(tempDir, "nested");
    fs.mkdirSync(nestedDir, { recursive: true });

    writePluginFile(
      nestedDir,
      "nested-tool.js",
      `export default {
        type: 'tool',
        name: 'nested-tool',
        description: 'Nested tool',
        version: 'v1.0.0',
        parameters: { type: 'object', properties: {} },
        run: async () => 'nested'
      }`,
    );

    const registry = new Registry();
    await loadPluginsFromDir(tempDir, registry, {});

    expect(registry.list("tool").map((tool: any) => tool.name)).toEqual([
      "nested-tool",
    ]);
  });

  describe("validation", () => {
    it("should accept a well-formed tool definition", () => {
      const validTool = {
        name: "test-tool",
        description: "A test tool",
        version: "v1.0.0",
        parameters: { type: "object", properties: {} },
        run: async () => "ok",
      };

      expect(() => validateTool(validTool, "source")).not.toThrow();
    });

    it("should reject a tool missing the name field", () => {
      const invalidTool = {
        description: "Missing name",
        version: "v1.0.0",
        parameters: { type: "object", properties: {} },
        run: async () => "err",
      };

      expect(() => validateTool(invalidTool, "source")).toThrow(/name/);
    });

    it("should reject a tool missing the run function", () => {
      const invalidTool = {
        name: "no-run",
        description: "Missing run",
        version: "v1.0.0",
        parameters: { type: "object", properties: {} },
      };

      expect(() => validateTool(invalidTool, "source")).toThrow(/run\(\)/);
    });
  });

  describe("loading", () => {
    it("should dynamically import and register valid tools", async () => {
      writePluginFile(
        tempDir,
        "dynamic-tool.js",
        `export default {
          type: 'tool',
          name: 'dynamic-tool',
          description: 'Dynamic tool',
          version: 'v1.0.0',
          parameters: { type: 'object', properties: {} },
          run: async () => 'dynamic'
        }`,
      );

      const registry = new Registry();
      await loadPluginsFromDir(tempDir, registry, {});

      expect(registry.has("tool", "dynamic-tool")).toBe(true);
    });

    it("should skip invalid tools and log an error", async () => {
      writePluginFile(
        tempDir,
        "invalid-tool.js",
        `export default {
          type: 'tool',
          name: 'invalid-tool',
          description: 'Invalid tool'
        }`,
      );

      const registry = new Registry();
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      await loadPluginsFromDir(tempDir, registry, {});

      expect(registry.list("tool")).toHaveLength(0);
      expect(errorSpy).toHaveBeenCalled();

      errorSpy.mockRestore();
    });
  });
});

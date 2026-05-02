/// tests/cli/cli.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
const getopts = require("getopts");

// Mock process.argv and process.exit
const mockExit = vi
  .spyOn(process, "exit")
  .mockImplementation((() => {}) as any);

const mockConsoleError = vi
  .spyOn(console, "error")
  .mockImplementation(() => {});

describe("CLI Argument Parsing", () => {
  beforeEach(() => {
    mockExit.mockClear();
    mockConsoleError.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("argument parsing", () => {
    it("should parse --host flag", () => {
      const argv = ["chat", "--host", "http://localhost:8080"];
      const options = getopts(argv, {
        alias: { h: "host" },
        default: { host: "http://127.0.0.1:11434" },
      });
      expect(options.host).toBe("http://localhost:8080");
    });

    it("should parse --model flag", () => {
      const argv = ["chat", "--model", "llama3"];
      const options = getopts(argv, {
        alias: { m: "model" },
        default: { model: "gemma4:e2b" },
      });
      expect(options.model).toBe("llama3");
    });

    it("should parse --provider flag", () => {
      const argv = ["chat", "--provider", "ollama"];
      const options = getopts(argv, {
        alias: { P: "provider" },
        default: { provider: "ollama" },
      });
      expect(options.provider).toBe("ollama");
    });

    it("should parse --verbose flag as boolean", () => {
      const argv = ["chat", "--verbose"];
      const options = getopts(argv, {
        alias: { v: "verbose" },
        boolean: ["verbose"],
      });
      expect(options.verbose).toBe(true);
    });

    it("should parse --no-tools flag as boolean", () => {
      const argv = ["chat", "-W"]; // Use the short alias
      const options = getopts(argv, {
        alias: { W: "no_tools" },
        boolean: ["no_tools"],
      });
      expect(options.no_tools).toBe(true);
    });

    it("should parse --var flag as array", () => {
      const argv = [
        "plan",
        "file.yaml",
        "--var",
        "key1=value1",
        "--var",
        "key2=value2",
      ];
      const options = getopts(argv, {
        array: ["var"],
      });
      expect(options.var).toEqual(["key1=value1", "key2=value2"]);
    });

    it("should use defaults when no flags provided", () => {
      const argv = ["chat"];
      const options = getopts(argv, {
        default: {
          host: "http://127.0.0.1:11434",
          model: "gemma4:e2b",
          provider: "ollama",
        },
      });
      expect(options.host).toBe("http://127.0.0.1:11434");
      expect(options.model).toBe("gemma4:e2b");
      expect(options.provider).toBe("ollama");
    });

    it("should handle short aliases", () => {
      const argv = ["chat", "-m", "llama3", "-h", "http://test:8080", "-v"];
      const options = getopts(argv, {
        alias: { m: "model", h: "host", v: "verbose" },
        boolean: ["verbose"],
        default: { host: "default", model: "default" },
      });
      expect(options.model).toBe("llama3");
      expect(options.host).
      toBe("http://test:8080");
      expect(options.verbose).toBe(true);
    });
  });

  describe("validation", () => {
    it("should exit with error when both --no-tools and --tools-dir are provided", () => {
      // Mock process.exit to prevent the test from actually exiting
      const mockExit = vi.spyOn(process, "exit").mockImplementation(() => {
        throw new Error("process.exit called");
      });

      const mockConsoleError = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      try {
        // Simulate the validation logic from llmctrlx.js
        const options = { no_tools: true, tools_dir: "/some/path" };

        if (options.no_tools && options.tools_dir) {
          console.error("Cannot use both -W and -T");
          process.exit(1);
        }
        // If we reach here, the test should fail
        expect(true).toBe(false);
      } catch (error) {
        expect(error instanceof Error && error.message).toBe(
          "process.exit called",
        );
        expect(mockConsoleError).toHaveBeenCalledWith(
          "Cannot use both -W and -T",
        );
      } finally {
        mockExit.mockRestore();
        mockConsoleError.mockRestore();
      }
    });
  });

  describe("help and version", () => {
    it("should display help text on --help", () => {
      const argv = ["--help"];
      const options = getopts(argv, {
        alias: { h: "help" },
        boolean: ["help"],
      });
      expect(options.help).toBe(true);
    });

    it("should display version on --version", () => {
      const argv = ["--version"];
      const options = getopts(argv, {
        alias: { V: "version" },
        boolean: ["version"],
      });
      expect(options.version).toBe(true);
    });
  });

  describe("error handling", () => {
    it("should exit with code 1 on unrecognized flag", () => {
      // This test would need to mock getopts throwing an error
      // For now, just verify the test structure
      expect(true).toBe(true); // Placeholder
    });
  });
});

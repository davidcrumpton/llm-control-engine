import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

let cmdTools: any;
let loadToolsSpy: any;
let logSpy: any;

describe("src/cli/tools.js", () => {
  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    await vi.resetModules();

    // @ts-ignore
    const coreTools = await import("../../src/core/tools.js");
    loadToolsSpy = vi.spyOn(coreTools, "loadTools");
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    // @ts-ignore
    const cliTools = await import("../../src/cli/tools.js");
    cmdTools = cliTools.cmdTools;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("prints no tools found when there are no tools", async () => {
    loadToolsSpy.mockResolvedValue([]);
    await cmdTools({}, "/path/to/tools");

    expect(loadToolsSpy).toHaveBeenCalledWith("/path/to/tools", null);
    expect(console.warn).toHaveBeenCalledWith("No tools found.");
  });

  it("prints tool names when --list is provided", async () => {
    loadToolsSpy.mockResolvedValue([{ name: "alpha" }, { name: "beta" }]);
    await cmdTools({ list: true }, "/path/to/tools");

    expect(logSpy).toHaveBeenNthCalledWith(1, "- alpha");
    expect(logSpy).toHaveBeenNthCalledWith(2, "- beta");
  });

  it("prints JSON output when --json is provided", async () => {
    const tools = [{ name: "alpha", description: "A tool" }];
    loadToolsSpy.mockResolvedValue(tools);

    await cmdTools({ json: true }, "/path/to/tools");

    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(tools, null, 2));
  });

  it("prints a single tool when --show is provided", async () => {
    const tool = { name: "alpha", description: "A tool" };
    loadToolsSpy.mockResolvedValue([tool]);

    await cmdTools({ show: "alpha" }, "/path/to/tools");

    expect(logSpy).toHaveBeenCalledWith(JSON.stringify(tool, null, 2));
  });

  it("prints an error when the requested tool is not found", async () => {
    loadToolsSpy.mockResolvedValue([{ name: "alpha" }]);
    
    await cmdTools({ show: "beta" }, "/path/to/tools");

    expect(console.error).toHaveBeenCalledWith('Error: Tool "beta" not found.');
  });

  it("passes tags through to loadTools when provided", async () => {
    loadToolsSpy.mockResolvedValue([]);

    await cmdTools({ tags: "foo,bar" }, "/path/to/tools");

    expect(loadToolsSpy).toHaveBeenCalledWith("/path/to/tools", ["foo", "bar"]);
    expect(console.warn).toHaveBeenCalledWith("No tools found.");
  });
});

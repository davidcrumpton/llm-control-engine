import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const historyCandidates = [
  "../../src/cli/history.js",
  "../../lib/cli/history.js",
  "../../../src/cli/history.js",
  "../../../lib/cli/history.js",
];

const historyPath = historyCandidates
  .map((candidate) => path.resolve(__dirname, candidate))
  .find(fs.existsSync);

if (!historyPath) {
  throw new Error("Unable to locate history.js in expected source locations.");
}

describe("cli/history.js", () => {
  it("loads without throwing and exports something useful", async () => {
    const history = await import(historyPath);
    expect(history).toBeDefined();
    expect(Object.keys(history).length).toBeGreaterThan(0);
    expect(history.default ?? history).toBeDefined();
  });

  it("exports at least one named member or default export", async () => {
    const history = await import(historyPath);
    const exportedKeys = Object.keys(history);
    expect(exportedKeys.length).toBeGreaterThan(0);
    expect(
      exportedKeys.some((key) => {
        const value = (history as Record<string, unknown>)[key];
        return (
          typeof value === "function" ||
          typeof value === "object" ||
          typeof value === "string"
        );
      }),
    ).toBe(true);
  });
});

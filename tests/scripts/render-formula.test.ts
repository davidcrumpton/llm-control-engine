/// tests/scripts/render-formula.test.ts
///
/// Regression tests for scripts/render-formula.mjs, the renderer the release
/// workflow uses to generate the tap's formula.
///
/// The renderer is only ever exercised in CI, on a clean checkout, and its
/// output path (Formula/llmctrlx.rb) points at a directory that exists in the
/// tap but not in this repository. The first real release therefore failed with
/// ENOENT after the formula itself had rendered fine — a rehearsal that wrote
/// to an already-existing temp directory could not have caught it. These tests
/// run the script as a subprocess so the filesystem behaviour is real.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../scripts/render-formula.mjs",
);

const PLATFORMS = ["macos-arm64", "macos-x64", "linux-arm64", "linux-x64"];

function hashFor(platform: string): string {
  // Distinct, recognisable hex checksums so a mix-up between platforms is
  // visible, while still satisfying the renderer's [0-9a-f]{64} validation.
  const seed = (PLATFORMS.indexOf(platform) + 1).toString(16);
  return seed.repeat(64).slice(0, 64);
}

function writeSums(dir: string, platforms: string[] = PLATFORMS): void {
  mkdirSync(dir, { recursive: true });
  for (const platform of platforms) {
    writeFileSync(
      join(dir, `llmctrlx-0.8.38-${platform}.tar.gz.sha256`),
      `${hashFor(platform)}  llmctrlx-0.8.38-${platform}.tar.gz\n`,
    );
  }
}

describe("render-formula", () => {
  let work: string;

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), "render-formula-"));
  });

  afterEach(() => {
    rmSync(work, { recursive: true, force: true });
  });

  it("creates the output directory when it does not exist yet", () => {
    // Exactly the CI shape: Formula/ is absent from this repo's checkout.
    const sums = join(work, "assets");
    const out = join(work, "Formula", "llmctrlx.rb");
    writeSums(sums);

    expect(() =>
      execFileSync(process.execPath, [
        SCRIPT,
        "--version",
        "0.8.38",
        "--sums",
        sums,
        "--out",
        out,
      ]),
    ).not.toThrow();

    const formula = readFileSync(out, "utf8");
    expect(formula).toContain('version "0.8.38"');
    expect(formula).not.toMatch(/\{\{[A-Z0-9_]+\}\}/);
    for (const platform of PLATFORMS) {
      expect(formula).toContain(hashFor(platform));
    }
  });

  it("fails instead of shipping a formula with a missing platform", () => {
    const sums = join(work, "assets");
    const out = join(work, "Formula", "llmctrlx.rb");
    writeSums(
      sums,
      PLATFORMS.filter((p) => p !== "macos-x64"),
    );

    expect(() =>
      execFileSync(process.execPath, [
        SCRIPT,
        "--version",
        "0.8.38",
        "--sums",
        sums,
        "--out",
        out,
      ]),
    ).toThrow();
  });
});

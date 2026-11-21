#!/usr/bin/env node
/**
 * Build standalone binaries with @yao-pkg/pkg.
 *
 * pkg fabricates a binary by patching a base Node build. When it also generates
 * V8 bytecode it must *execute* that base, which fails for a foreign CPU (x86_64
 * on Apple Silicon needs Rosetta). With --no-bytecode it only patches, so a
 * single arm64 host can produce both arm64 and x86_64 binaries for the same OS.
 *
 * package.json "pkg.targets" declares the supported matrix. This script builds
 * the host target by default, so `npm run build` works on any developer machine.
 *
 * Outputs are named `dist/llmctrlx-<os>-<arch>` (e.g. llmctrlx-macos-arm64).
 * The host build is additionally hard-linked to `dist/llmctrlx-<os>`, the name
 * build:deb / build:rpm expect.
 *
 * Override the matrix (space-separated or comma-separated):
 *   PKG_TARGETS=node20-linux-x64,node20-linux-arm64 npm run build:bin
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, linkSync, renameSync } from 'node:fs';

const OS = { darwin: 'macos', linux: 'linux' }[process.platform];
const ARCH = { arm64: 'arm64', x64: 'x64' }[process.arch];

if (!OS || !ARCH) {
  console.error(`build-bin: unsupported build host ${process.platform}/${process.arch}`);
  process.exit(1);
}

const hostTarget = `node20-${OS}-${ARCH}`;
const requested = (process.env.PKG_TARGETS ?? '')
  .split(/[,\s]+/)
  .map((t) => t.trim())
  .filter(Boolean);
const targets = requested.length > 0 ? requested : [hostTarget];

for (const target of targets) {
  const isHost = target === hostTarget;

  // Bytecode is a startup optimisation only. Skip it whenever it would require
  // executing a binary for another architecture; the failure is racy, so it
  // cannot be left to chance.
  const args = ['@yao-pkg/pkg', '.', '--targets', target, '--out-path', 'dist/'];
  if (!isHost) args.push('--no-bytecode');

  console.log(`build-bin: packaging ${target}${isHost ? '' : ' (--no-bytecode)'}`);
  const { status } = spawnSync('npx', args, { stdio: 'inherit' });
  if (status !== 0) {
    console.error(`build-bin: pkg failed for ${target}`);
    process.exit(status ?? 1);
  }

  const [, targetOs, targetArch] = target.split('-');
  const produced = 'dist/llmctrlx';
  if (!existsSync(produced)) {
    console.error(`build-bin: expected ${produced} to exist after packaging ${target}`);
    process.exit(1);
  }

  const out = `dist/llmctrlx-${targetOs}-${targetArch}`;
  renameSync(produced, out);
  console.log(`build-bin: wrote ${out}`);

  if (isHost) {
    const legacy = `dist/llmctrlx-${targetOs}`;
    try {
      linkSync(out, legacy);
    } catch {
      copyFileSync(out, legacy);
    }
    console.log(`build-bin: wrote ${legacy} (host alias)`);
  }
}

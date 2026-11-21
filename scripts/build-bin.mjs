#!/usr/bin/env node
/**
 * Build standalone binaries with @yao-pkg/pkg.
 *
 * pkg fabricates a binary by patching a base Node build, and it has to execute
 * that base. A base for a foreign CPU cannot run without emulation (x86_64 on
 * Apple Silicon needs Rosetta), so a host can only produce binaries for its own
 * platform+arch. Building the whole matrix therefore needs a CI matrix with one
 * runner per target.
 *
 * package.json "pkg.targets" declares the supported matrix. This script builds
 * the host target by default, so `npm run build` works on any developer machine.
 *
 * Override to build specific targets (each file gets an os+arch suffix):
 *   PKG_TARGETS=node20-linux-x64,node20-linux-arm64 npm run build:bin
 */
import { spawnSync } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';

const OS = { darwin: 'macos', linux: 'linux' }[process.platform];
const ARCH = { arm64: 'arm64', x64: 'x64' }[process.arch];

if (!OS || !ARCH) {
  console.error(`build-bin: unsupported build host ${process.platform}/${process.arch}`);
  process.exit(1);
}

const hostTarget = `node20-${OS}-${ARCH}`;
const requested = (process.env.PKG_TARGETS ?? '')
  .split(',')
  .map((t) => t.trim())
  .filter(Boolean);
const targets = requested.length > 0 ? requested : [hostTarget];

for (const target of targets) {
  const isHost = target === hostTarget;

  // pkg precompiles V8 bytecode by spawning the target's base Node binary. That
  // cannot work for a foreign OS/arch (x86_64 on Apple Silicon dies with
  // "spawn Unknown system error -86"), and the failure is racy: it sometimes
  // falls back to shipping source instead of crashing. Cross-target builds
  // therefore always disable bytecode; host builds keep it for faster startup.
  const args = ['@yao-pkg/pkg', '.', '--targets', target, '--out-path', 'dist/'];
  if (!isHost) args.push('--no-bytecode');

  console.log(`build-bin: packaging ${target}${isHost ? '' : ' (--no-bytecode)'}`);
  const { status } = spawnSync('npx', args, { stdio: 'inherit' });
  if (status !== 0) {
    console.error(`build-bin: pkg failed for ${target}`);
    process.exit(status ?? 1);
  }

  // pkg names a single-target build after the package ("llmctrlx"), so rename it
  // with a platform suffix. The host build keeps the historical `llmctrlx-<os>`
  // name that build:deb / build:rpm expect; extra targets get os+arch.
  const [, targetOs, targetArch] = target.split('-');
  const produced = 'dist/llmctrlx';
  if (!existsSync(produced)) {
    console.error(`build-bin: expected ${produced} to exist after packaging ${target}`);
    process.exit(1);
  }
  const suffix = isHost ? targetOs : `${targetOs}-${targetArch}`;
  const out = `dist/llmctrlx-${suffix}`;
  renameSync(produced, out);
  console.log(`build-bin: wrote ${out}`);
}

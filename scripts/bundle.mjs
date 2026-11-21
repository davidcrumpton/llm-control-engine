#!/usr/bin/env node
/**
 * Bundle llmctrlx.ts into dist/llmctrlx.cjs.
 *
 * The CLI reports its version, so the version must not be duplicated in the
 * source — a hardcoded constant drifts from package.json the first time either
 * one is bumped. package.json is the single source of truth; it is inlined here
 * as a build-time define, which also works inside a pkg snapshot (no runtime
 * read of package.json).
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
);

const args = [
  'esbuild',
  'llmctrlx.ts',
  '--inject:polyfill.js',
  '--bundle',
  '--packages=external',
  '--platform=node',
  '--format=cjs',
  `--define:__APP_VERSION__=${JSON.stringify(version)}`,
  '--outfile=dist/llmctrlx.cjs',
];

console.log(`bundle: version ${version}`);
const { status } = spawnSync('npx', args, { stdio: 'inherit' });
if (status !== 0) process.exit(status ?? 1);

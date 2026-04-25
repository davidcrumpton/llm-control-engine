/// tests/__mocks__/child_process.ts
import { vi } from 'vitest';
import { EventEmitter } from 'events';

/**
 * Creates a mock ChildProcess that emits configurable
 * stdout/stderr/exit.
 */
function createMockChildProcess(
  stdout = '',
  stderr = '',
  exitCode = 0
) {
  const proc = new EventEmitter() as any;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.stdin = { write: vi.fn(), end: vi.fn() };
  proc.pid = 12345;
  proc.kill = vi.fn();

  // Schedule emissions on next tick so listeners can attach first
  process.nextTick(() => {
    if (stdout) proc.stdout.emit('data', Buffer.from(stdout));
    if (stderr) proc.stderr.emit('data', Buffer.from(stderr));
    proc.emit('close', exitCode);
  });

  return proc;
}

export const exec = vi.fn(
  (_cmd: string, _opts: any, cb?: Function) => {
    const proc = createMockChildProcess();
    if (cb) process.nextTick(() => cb(null, '', ''));
    return proc;
  }
);

export const execSync = vi.fn().mockReturnValue(Buffer.from(''));

export const spawn = vi.fn((_cmd: string, _args?: string[]) => {
  return createMockChildProcess();
});

export const fork = vi.fn((_modulePath: string) => {
  return createMockChildProcess();
});

export { createMockChildProcess };
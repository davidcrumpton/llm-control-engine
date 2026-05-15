/**
 * Run command handler for llmctrlx
 *
 * Executes a shell command from the allow-list, then sends stdout to the LLM
 * for interpretation.
 *
 * Pass --record <file> to capture the full session (inputs, shell output,
 * LLM response, timestamps) into a replay-compatible JSON file.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Recorder } from '../core/recorder.js';
import { loadHistory, saveHistory, getSession, getHistoryWindow } from '../core/history.js';
import { compactMessages, buildOptions } from '../core/utils.js';
import type { CLIOptions, LLMProvider } from '../types.js'

const execFileAsync = promisify(execFile);

// ─── Configuration ────────────────────────────────────────────────────────────

const ALLOWED_EXECUTABLES = new Set([
  'ls', 'cat', 'echo', 'pwd', 'date', 'whoami',
  'df', 'du', 'uname', 'uptime', 'ps',
  'git', 'node', 'npm', 'python', 'python3',
]);

const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB
const EXEC_TIMEOUT_MS = 30_000; // 30 s
const SHELL_META_RE = /[;&|`$<>\\!{}()\n\r]/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Validates and parses the command string.
 * Returns { executable, args } or throws an Error.
 */
function validateCommand(rawInput: string | undefined): { executable: string, args: string[] } {
  if (!rawInput?.trim()) {
    throw new Error('Empty command provided.');
  }

  if (SHELL_META_RE.test(rawInput)) {
    throw new Error('Command rejected: shell metacharacters are not permitted.');
  }

  const tokens = parseTokens(rawInput);
  const [executable, ...args] = tokens;

  if (!executable || !ALLOWED_EXECUTABLES.has(executable)) {
    throw new Error(`Command rejected: '${executable ?? ''}' is not in the allow-list.`);
  }

  return { executable, args };
}

/**
 * Parse a command string into tokens, respecting quoted strings.
 * Handles both single and double-quoted arguments.
 */
function parseTokens(input: string): string[] {
  const tokens = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = null;

  for (const char of input) {
    if (inQuotes) {
      if (char === quoteChar) {
        tokens.push(current);
        current = '';
        inQuotes = false;
        quoteChar = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuotes = true;
      quoteChar = char;
    } else if (char === ' ' || char === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * Safely invokes a recorder method only if a recorder exists.
 * Prevents repetitive `if (recorder)` checks throughout the code.
 * @param {Recorder|null} recorder
 * @param {string} method
 * @param  {...any} args
 */
function record(recorder: Recorder | null, method: string, ...args: any[]) {
  if (recorder) (recorder as any)[method](...args);
}

/**
 * Execute the shell command and return stdout.
 */
async function executeCommand(executable: string, args: string[], recorder: Recorder | null): Promise<string> {
  record(recorder, 'markExecStart');

  const { stdout, stderr, error: execError } = await execFileAsync(
    executable,
    args,
    {
      timeout: EXEC_TIMEOUT_MS,
      maxBuffer: MAX_OUTPUT_BYTES,
      windowsHide: true,
      env: { ...process.env, SHLVL: '1' },
    }
  );

  record(recorder, 'markExecEnd');

  if (execError || stderr) {
    throw new Error(`Shell execution error: ${stderr || execError?.message}`);
  }

  return stdout;
}

/**
 * Filter the LLM response using engine hooks
 */
async function filterResponse(output: string, engineHooks: any, options: CLIOptions, prompt: string): Promise<string> {
  if (typeof engineHooks?.filterResponse !== 'function') return output;

  const result = await engineHooks.filterResponse('run', {
    output,
    content: output, // Alias for backward compatibility
    prompt,
    requestId: 'run',
    filtered: false,
    requestMeta: { flags: options },
  });

  return result.output || result.content;
}

// ─── Main command ─────────────────────────────────────────────────────────────

/**
 * Handle run command
 *
 * @param {Object} llm         - LLM provider instance
 * @param {Object} options     - CLI options (includes options.record for session path)
 * @param {Object} engineHooks - Optional engine hook system
 */
export async function cmdRun(llm: LLMProvider, options: CLIOptions, defaultHistoryFile: string, engineHooks?: any) {
  const recordFile = options.record ?? null;
  const recorderInputs = {
    model: options.model,
    parameters: {
      temperature: options.temperature,
      top_p: options.top_p,
      num_ctx: options.num_ctx,
    },
    command: options.user,
  };
  const recorder = recordFile ? new Recorder('run', recorderInputs) : null;

  const historyData = loadHistory(defaultHistoryFile);
  const session = getSession(historyData, options.session);
  const historyWindow = getHistoryWindow(session, options.history_length);

  try {
    const rawCommand = options.user;
    const { executable, args } = validateCommand(rawCommand);

    if (engineHooks) {
      const gate = await engineHooks.gateInference('run', rawCommand);
      if (!gate.allowed) {
        throw new Error(`Command blocked by policy: ${gate.reason}`);
      }
    }

    const stdout = await executeCommand(executable, args, recorder);

    record(recorder, 'markLlmStart');

    const userContent = `I executed the shell command "${rawCommand}" and received the following output:\n\n\`\`\`\n${stdout}\n\`\`\`\n\nPlease analyze this output and explain what it means.`;
    const systemContent = options.system || 'You are a helpful assistant that analyzes shell command output to provide technical insights.';

    const messages = compactMessages([
      { role: 'system', content: systemContent },
      ...historyWindow,
      { role: 'user', content: userContent },
    ]);

    const chatOptions = buildOptions(options);
    const res = await llm.chat({
      model: options.model,
      messages,
      options: chatOptions,
    });
    record(recorder, 'markLlmEnd');

    const llmResponse = res.message.content;
    const filtered = await filterResponse(llmResponse, engineHooks, options, userContent);
    console.log(filtered);

    session.messages.push({ role: 'user', content: userContent });
    session.messages.push({ role: 'assistant', content: filtered });
    saveHistory(defaultHistoryFile, historyData);

    if (recorder) {
      recorder.setOutputs({ stdout, llmResponse: filtered, exitCode: 0 });
      await recorder.save(recordFile);
      console.error(`[record] session saved → ${recordFile}`);
    }

  } catch (err) {
    const message = err.killed
      ? `Timeout: Command exceeded ${EXEC_TIMEOUT_MS / 1000}s`
      : err.message;

    console.error(`[Error] ${message}`);

    if (recorder) {
      recorder.setOutputs({ llmResponse: '', exitCode: 1, error: message });
      try {
        await recorder.save(recordFile);
        console.error(`[record] partial session saved → ${recordFile}`);
      } catch {
        // ignore save errors on failure path
      }
    }

    process.exitCode = 1;
  }
}

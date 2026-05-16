/**
 * Run command handler for llmctrlx
 *
 * Executes a shell command from the allow-list, then sends stdout to the LLM
 * for interpretation.
 *
 * Pass --record <file> to capture the full session (inputs, shell output,
 * LLM response, timestamps) into a replay-compatible JSON file.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { Recorder } from "../core/recorder.js";
import {
  loadHistory,
  saveHistory,
  getSession,
  getHistoryWindow,
} from "../core/history.js";
import { compactMessages, buildOptions } from "../core/utils.js";
import type {
  CLIOptions,
  LLMProvider,
  IEngineHooks,
  IRecorder,
} from "../types.js";

const execFileAsync = promisify(execFile);

// ─── Configuration ────────────────────────────────────────────────────────────

const DEFAULT_ALLOWED_EXECUTABLES = new Set([
  "ls",
  "cat",
  "echo",
  "pwd",
  "date",
  "whoami",
  "df",
  "du",
  "uname",
  "uptime",
  "ps",
  "git",
  "node",
  "npm",
  "python",
  "python3",
]);

const MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MB
const EXEC_TIMEOUT_MS = 30_000; // 30 s
const SHELL_META_RE = /[;&|`$<>\\!{}()\n\r]/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the allow-list of executables from CLI options or fall back
 * to the built-in default set.
 */
function getAllowedExecutables(options: CLIOptions): ReadonlySet<string> {
  if (Array.isArray((options as any).allowedCommands)) {
    return new Set((options as any).allowedCommands as string[]);
  }
  return DEFAULT_ALLOWED_EXECUTABLES;
}

/**
 * Validates and parses the command string.
 * Returns { executable, args } or throws an Error.
 */
function validateCommand(
  rawInput: string | undefined,
  allowedExecutables: ReadonlySet<string>,
): { executable: string; args: string[] } {
  if (!rawInput?.trim()) {
    throw new Error("Empty command provided.");
  }

  if (SHELL_META_RE.test(rawInput)) {
    throw new Error(
      "Command rejected: shell metacharacters are not permitted.",
    );
  }

  const tokens = parseTokens(rawInput);
  const [executable, ...args] = tokens;

  if (!executable || !allowedExecutables.has(executable)) {
    throw new Error(
      `Command rejected: '${executable ?? ""}' is not in the allow-list.`,
    );
  }

  return { executable, args };
}

/**
 * Parse a command string into tokens, respecting quoted strings.
 * Handles both single and double-quoted arguments.
 */
function parseTokens(input: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar: string | null = null;

  for (const char of input) {
    if (inQuotes) {
      if (char === quoteChar) {
        tokens.push(current);
        current = "";
        inQuotes = false;
        quoteChar = null;
      } else {
        current += char;
      }
    } else if (char === '"' || char === "'") {
      inQuotes = true;
      quoteChar = char;
    } else if (char === " " || char === "\t") {
      if (current) {
        tokens.push(current);
        current = "";
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
 */
function record<K extends keyof IRecorder>(
  recorder: IRecorder | null,
  method: K,
  ...args: Parameters<IRecorder[K]>
): void {
  const fn = recorder?.[method];
  if (typeof fn === "function") {
    // TS can't prove `this` type here; runtime is fine.
    (fn as (...a: Parameters<IRecorder[K]>) => void).apply(recorder, args);
  }
}

/**
 * Build the user-facing context prompt for the LLM from the command and output.
 * Decoupled from cmdRun for testability.
 */
function buildContextPrompt(output: string, command: string): string {
  return (
    `I executed the shell command "${command}" and received the following output:\n\n` +
    "```" +
    `\n${output}\n` +
    "```" +
    "\n\nPlease analyze this output and explain what it means."
  );
}

/**
 * Execute the shell command and return stdout.
 */
async function executeCommand(
  executable: string,
  args: string[],
  recorder: Recorder | null,
): Promise<string> {
  record(recorder, "markExecStart");

  const { stdout, stderr } = await execFileAsync(executable, args, {
    timeout: EXEC_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
    // Do not override SHLVL; preserve environment as-is.
    env: {
      ...process.env,
    },
  });

  record(recorder, "markExecEnd");

  if (stderr) {
    throw new Error(`Shell execution error: ${stderr}`);
  }

  return stdout;
}

/**
 * Filter the LLM response using engine hooks
 */
async function filterResponse(
  output: string,
  engineHooks: IEngineHooks | undefined,
  options: CLIOptions,
  prompt: string,
): Promise<string> {
  if (typeof engineHooks?.filterResponse !== "function") return output;

  const result = await engineHooks.filterResponse("run", {
    output,
    content: output, // Alias for backward compatibility
    prompt,
    requestId: "run",
    filtered: false,
    requestMeta: { flags: options },
  });

  // Prefer explicit output, then legacy content, finally fall back to original.
  return result.output ?? result.content ?? output;
}

// ─── Main command ─────────────────────────────────────────────────────────────

/**
 * Handle run command
 */
export async function cmdRun(
  llm: LLMProvider,
  options: CLIOptions,
  defaultHistoryFile: string,
  engineHooks?: IEngineHooks,
) {
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

  const recorder = recordFile ? new Recorder("run", recorderInputs) : null;

  const historyData = loadHistory(defaultHistoryFile);
  const session = getSession(historyData, options.session);
  const historyWindow = getHistoryWindow(session, options.history_length);

  const allowedExecutables = getAllowedExecutables(options);

  try {
    const rawCommand = options.user;
    const { executable, args } = validateCommand(
      rawCommand,
      allowedExecutables,
    );

    if (engineHooks?.gateInference) {
      const gate = await engineHooks.gateInference("run", rawCommand!);
      if (!gate.allowed) {
        throw new Error(`Command blocked by policy: ${gate.reason}`);
      }
    }

    const stdout = await executeCommand(executable, args, recorder);

    record(recorder, "markLlmStart");

    const userContent = buildContextPrompt(stdout, rawCommand!);
    const systemContent =
      options.system ||
      "You are a helpful assistant that analyzes shell command output to provide technical insights.";

    const messages = compactMessages([
      { role: "system" as const, content: systemContent },
      ...historyWindow,
      { role: "user" as const, content: userContent },
    ]);

    const chatOptions = buildOptions(options);
    const res = await llm.chat({
      model: options.model!,
      messages,
      options: chatOptions,
    });

    // Future streaming support: this branch can return an async generator
    // or ReadableStream instead of throwing.
    if (Symbol.asyncIterator in res) {
      throw new Error("Streaming not supported in cmdRun");
    }

    const llmResponse = res.message.content;
    const filtered = await filterResponse(
      llmResponse,
      engineHooks,
      options,
      userContent,
    );

    console.log(filtered);

    // Avoid relying on in-place mutation identity for history consumers:
    // rebuild the messages array instead of pushing directly.
    const updatedMessages = [
      ...session.messages,
      { role: "user" as const, content: userContent },
      { role: "assistant" as const, content: filtered },
    ];
    session.messages = updatedMessages;

    saveHistory(defaultHistoryFile, historyData);

    if (recorder) {
      recorder.setOutputs({
        stdout,
        llmResponse: filtered,
        exitCode: 0,
      });
      await recorder.save(recordFile!);
      console.error(`[record] session saved → ${recordFile}`);
    }
  } catch (err: any) {
    const message = err.killed
      ? `Timeout: Command exceeded ${EXEC_TIMEOUT_MS / 1000}s`
      : err.message;

    console.error(`[Error] ${message}`);

    if (recorder) {
      recorder.setOutputs({
        llmResponse: "",
        exitCode: 1,
        error: message,
      });

      try {
        await recorder.save(recordFile!);
        console.error(`[record] partial session saved → ${recordFile}`);
      } catch {
        // ignore save errors on failure path
      }
    }

    process.exitCode = 1;
  }
}

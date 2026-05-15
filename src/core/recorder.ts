/**
 * Recorder — session capture for llmctrlx
 *
 * Wraps cmdRun / cmdChat / cmdPlan to record every meaningful event
 * (shell execution, LLM calls, tool calls, step results) into a
 * structured one-file-per-run session envelope.
 *
 * The session file is self-contained: replay needs nothing else.
 *
 * Session envelope shape
 * ─────────────────────
 * {
 *   version        : "1"
 *   command_type   : "run" | "chat" | "plan"
 *   runHash        : sha256 of canonical(inputs)   ← reproducibility fingerprint
 *   recordedAt     : ISO-8601
 *   inputs         : { model, parameters, … }      ← everything needed to re-run
 *   events         : [ ToolCallEvent | StepEvent ]  ← ordered execution trace
 *   outputs        : { llmResponse, stdout?, exitCode? }
 *   timestamps     : { execStart, execEnd, llmStart, llmEnd }
 * }
 */

import fs from "node:fs/promises";
import crypto from "node:crypto";
import {
  CommandType,
  Session,
  SessionEvent,
  ToolCallEvent,
  StepEvent,
  SessionOutputs,
  SessionTimestamps,
} from "../types.js";

// ─── Constants ───────────────────────────────────────────────────────────────

export const SESSION_VERSION = "1";

// ─── Hashing ─────────────────────────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 fingerprint over the run inputs.
 * Keys are sorted before serialisation so field-order differences
 * in the options object never cause a false hash mismatch on replay.
 */
export function hashInputs(inputs: Record<string, unknown>): string {
  const canonical = JSON.stringify(inputs, Object.keys(inputs).sort());
  return crypto.createHash("sha256").update(canonical).digest("hex");
}

// ─── Recorder class ──────────────────────────────────────────────────────────

export class Recorder {
  commandType: CommandType;
  inputs: Record<string, unknown>;
  runHash: string;
  recordedAt: string;
  events: SessionEvent[];
  outputs: SessionOutputs;
  timestamps: SessionTimestamps;

  /**
   * Create a new session recorder.
   *
   * @param commandType - "run" | "chat" | "plan"
   * @param inputs - Canonicalisable description of this run's inputs
   */
  constructor(commandType: CommandType, inputs: Record<string, unknown>) {
    this.commandType = commandType;
    this.inputs = inputs;
    this.runHash = hashInputs(inputs);
    this.recordedAt = new Date().toISOString();

    this.events = [];
    this.outputs = {};
    this.timestamps = {};
  }

  // ── Timestamp helpers ──────────────────────────────────────────────────────

  markExecStart(): void {
    this.timestamps.execStart = new Date().toISOString();
  }

  markExecEnd(): void {
    this.timestamps.execEnd = new Date().toISOString();
  }

  markLlmStart(): void {
    this.timestamps.llmStart = new Date().toISOString();
  }

  markLlmEnd(): void {
    this.timestamps.llmEnd = new Date().toISOString();
  }

  // ── Event recording ────────────────────────────────────────────────────────

  /**
   * Record a single tool invocation.
   * Call this *after* executeTool() resolves so `result` is the ground truth.
   */
  recordToolCall(
    tool: string,
    args: Record<string, unknown>,
    result: string,
  ): void {
    this.events.push({
      type: "tool_call",
      tool,
      args,
      result,
      timestamp: new Date().toISOString(),
    } as ToolCallEvent);
  }

  /**
   * Record a plan step result.
   */
  recordStep(
    stepId: string,
    stepName: string,
    exec: string,
    result: {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    },
  ): void {
    this.events.push({
      type: "step",
      stepId,
      stepName,
      exec,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      timestamp: new Date().toISOString(),
    } as StepEvent);
  }

  /**
   * Set the final outputs produced by this run.
   */
  setOutputs(outputs: SessionOutputs): void {
    this.outputs = outputs;
  }

  // ── Serialisation ──────────────────────────────────────────────────────────

  toJSON(): Session {
    return {
      version: SESSION_VERSION,
      command_type: this.commandType,
      runHash: this.runHash,
      recordedAt: this.recordedAt,
      inputs: this.inputs,
      events: this.events,
      outputs: this.outputs,
      timestamps: this.timestamps,
    };
  }

  /**
   * Write the session envelope to `filePath`.
   */
  async save(filePath: string): Promise<void> {
    await fs.writeFile(
      filePath,
      JSON.stringify(this.toJSON(), null, 2),
      "utf8",
    );
  }
}

// ─── Session loading ─────────────────────────────────────────────────────────

/**
 * Load and lightly validate a session file written by Recorder.save().
 *
 * @throws {Error} if the file is missing required fields or has an unknown version
 */
export async function loadSession(filePath: string): Promise<Session> {
  const raw = await fs.readFile(filePath, "utf8");
  const session = JSON.parse(raw) as unknown;

  if (!isValidSession(session)) {
    throw new Error("Session validation failed: not a valid session object");
  }

  if (session.version !== SESSION_VERSION) {
    throw new Error(
      `Unsupported session version '${session.version}'. Expected '${SESSION_VERSION}'.`,
    );
  }

  const required: (keyof Session)[] = [
    "command_type",
    "runHash",
    "inputs",
    "outputs",
  ];
  for (const field of required) {
    if (!(field in session)) {
      throw new Error(`Session file is missing required field: '${field}'`);
    }
  }

  return session as Session;
}

// ─── Type guard ──────────────────────────────────────────────────────────────

function isValidSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.version === "string" &&
    typeof obj.command_type === "string" &&
    typeof obj.runHash === "string" &&
    typeof obj.recordedAt === "string" &&
    typeof obj.inputs === "object" &&
    Array.isArray(obj.events) &&
    typeof obj.outputs === "object" &&
    typeof obj.timestamps === "object"
  );
}

// ─── onToolCall factory ───────────────────────────────────────────────────────

/**
 * Build an onToolCall callback that writes into a Recorder instance.
 * Pass the returned function to runWithTools() via chatOptions.onToolCall.
 */
export function makeToolCallRecorder(
  recorder: Recorder,
): (tool: string, args: Record<string, unknown>, result: string) => void {
  return (tool: string, args: Record<string, unknown>, result: string) =>
    recorder.recordToolCall(tool, args, result);
}

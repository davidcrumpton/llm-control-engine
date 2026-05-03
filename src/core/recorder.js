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

import fs   from 'node:fs/promises'
import crypto from 'node:crypto'

// ─── Constants ───────────────────────────────────────────────────────────────

export const SESSION_VERSION = '1'

// ─── Hashing ─────────────────────────────────────────────────────────────────

/**
 * Compute a deterministic SHA-256 fingerprint over the run inputs.
 * Keys are sorted before serialisation so field-order differences
 * in the options object never cause a false hash mismatch on replay.
 *
 * @param {Object} inputs
 * @returns {string} hex digest
 */
export function hashInputs(inputs) {
  const canonical = JSON.stringify(inputs, Object.keys(inputs).sort())
  return crypto.createHash('sha256').update(canonical).digest('hex')
}

// ─── Recorder class ──────────────────────────────────────────────────────────

export class Recorder {
  /**
   * @param {string} commandType  - "run" | "chat" | "plan"
   * @param {Object} inputs       - Canonicalisable description of this run's inputs
   */
  constructor(commandType, inputs) {
    this.commandType = commandType
    this.inputs      = inputs
    this.runHash     = hashInputs(inputs)
    this.recordedAt  = new Date().toISOString()

    this.events      = []
    this.outputs     = {}
    this.timestamps  = {}
  }

  // ── Timestamp helpers ──────────────────────────────────────────────────────

  markExecStart()  { this.timestamps.execStart = new Date().toISOString() }
  markExecEnd()    { this.timestamps.execEnd   = new Date().toISOString() }
  markLlmStart()   { this.timestamps.llmStart  = new Date().toISOString() }
  markLlmEnd()     { this.timestamps.llmEnd    = new Date().toISOString() }

  // ── Event recording ────────────────────────────────────────────────────────

  /**
   * Record a single tool invocation.
   * Call this *after* executeTool() resolves so `result` is the ground truth.
   *
   * @param {string} tool   - Tool name
   * @param {Object} args   - Arguments passed to the tool
   * @param {string} result - Raw string output from the tool
   */
  recordToolCall(tool, args, result) {
    this.events.push({
      type      : 'tool_call',
      tool,
      args,
      result,
      timestamp : new Date().toISOString(),
    })
  }

  /**
   * Record a plan step result.
   *
   * @param {string} stepId   - step.id from the plan YAML
   * @param {string} stepName - step.name (human label)
   * @param {string} exec     - The command / tool / 'prompt' label
   * @param {Object} result   - { stdout, stderr, exitCode }
   */
  recordStep(stepId, stepName, exec, result) {
    this.events.push({
      type      : 'step',
      stepId,
      stepName,
      exec,
      stdout    : result.stdout,
      stderr    : result.stderr,
      exitCode  : result.exitCode,
      timestamp : new Date().toISOString(),
    })
  }

  /**
   * Set the final outputs produced by this run.
   *
   * @param {Object} outputs - { llmResponse, stdout?, exitCode? }
   */
  setOutputs(outputs) {
    this.outputs = outputs
  }

  // ── Serialisation ──────────────────────────────────────────────────────────

  toJSON() {
    return {
      version      : SESSION_VERSION,
      command_type : this.commandType,
      runHash      : this.runHash,
      recordedAt   : this.recordedAt,
      inputs       : this.inputs,
      events       : this.events,
      outputs      : this.outputs,
      timestamps   : this.timestamps,
    }
  }

  /**
   * Write the session envelope to `filePath`.
   *
   * @param {string} filePath
   */
  async save(filePath) {
    await fs.writeFile(filePath, JSON.stringify(this.toJSON(), null, 2), 'utf8')
  }
}

// ─── Session loading ─────────────────────────────────────────────────────────

/**
 * Load and lightly validate a session file written by Recorder.save().
 *
 * @param {string} filePath
 * @returns {Promise<Object>} Parsed session envelope
 * @throws {Error} if the file is missing required fields or has an unknown version
 */
export async function loadSession(filePath) {
  const raw     = await fs.readFile(filePath, 'utf8')
  const session = JSON.parse(raw)

  if (session.version !== SESSION_VERSION) {
    throw new Error(
      `Unsupported session version '${session.version}'. Expected '${SESSION_VERSION}'.`
    )
  }

  const required = ['command_type', 'runHash', 'inputs', 'outputs']
  for (const field of required) {
    if (!(field in session)) {
      throw new Error(`Session file is missing required field: '${field}'`)
    }
  }

  return session
}

// ─── onToolCall factory ───────────────────────────────────────────────────────

/**
 * Build an onToolCall callback that writes into a Recorder instance.
 * Pass the returned function to runWithTools() via chatOptions.onToolCall.
 *
 * @param {Recorder} recorder
 * @returns {Function} (tool, args, result) => void
 */
export function makeToolCallRecorder(recorder) {
  return (tool, args, result) => recorder.recordToolCall(tool, args, result)
}
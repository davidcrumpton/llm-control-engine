/**
 * Comprehensive type definitions for llmctrlx
 *
 * This file contains all shared interfaces, types, and utilities used across
 * the llmctrlx codebase. It serves as the single source of truth for type contracts.
 */

// ─── Core type utilities ─────────────────────────────────────────────────────

export type PluginType = "tool" | "policy" | "provider" | "hook";
export type Provider = "ollama" | "lmstudio" | "openai";
export type CommandType = "run" | "chat" | "plan";
export type MessageRole = "user" | "assistant" | "system" | "tool";

// ─── LLM Chat and Response Types ──────────────────────────────────────────────

export interface ChatMessage {
  role: MessageRole;
  content: string;
}

export interface MessageContent {
  text?: string;
  [key: string]: unknown;
}

export interface LLMMessage {
  role: MessageRole;
  content: string | MessageContent[];
  thinking?: string;
  images?: string[];
}

export interface ChatChoice {
  message: LLMMessage;
  finish_reason?: string;
}

export interface LLMResponse {
  message: {
    content: string;
    thinking?: string;
  };
  model?: string;
  choices?: ChatChoice[];
  eval_count?: number | string;
  prompt_eval_count?: number | string;
}

export interface ChatParams {
  model: string;
  messages: LLMMessage[];
  options?: Record<string, unknown>;
  [key: string]: unknown;
}

// ─── LLM Provider Interface ──────────────────────────────────────────────────

export interface LLMProvider {
  defaultModel: string;
  capabilities: string[];

  chat(params: ChatParams): Promise<LLMResponse | AsyncIterable<LLMResponse>>;
  list(): Promise<{ models: string[] }>;
  show?(params: { model: string }): Promise<unknown>;
  pull?(params: { model: string }): Promise<void>;
  delete?(params: { model: string }): Promise<void>;
  embeddings?(params: Record<string, unknown>): Promise<unknown>;
  getHelpMessage?(): string | void;
}

// ─── Plugin System Types ─────────────────────────────────────────────────────

export interface BasePlugin {
  type: PluginType;
  name: string;
}

export interface ToolPlugin extends BasePlugin {
  type: "tool";
  run(args: Record<string, unknown>): Promise<string>;
  description: string;
  parameters?: Record<string, unknown>;
  tags?: string[];
  policies?: {
    requires?: string[];
    maxCalls?: number;
  };
}

export interface PolicyPlugin extends BasePlugin {
  type: "policy";
  onBeforeToolRun(ctx: PolicyContext): Promise<PolicyResult | null>;
}

export interface HookPlugin extends BasePlugin {
  type: "hook";
  [key: string]: unknown;
}

export interface ProviderPlugin extends BasePlugin {
  type: "provider";
}

export type Plugin = ToolPlugin | PolicyPlugin | ProviderPlugin | HookPlugin;

export interface PolicyContext {
  tool: ToolPlugin;
  args: Record<string, unknown>;
  ctx?: Record<string, unknown>;
  tools?: ToolPlugin[];
  messages?: LLMMessage[];
  model?: string;
}

export interface PolicyResult {
  allow?: boolean;
  message?: string;
}

// ─── Session and Recording Types ─────────────────────────────────────────────

export interface ToolCallEvent {
  type: "tool_call";
  tool: string;
  args: Record<string, unknown>;
  result: string;
  timestamp: string;
}

export interface StepEvent {
  type: "step";
  stepId: string;
  stepName: string;
  exec: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  timestamp: string;
}

export type SessionEvent = ToolCallEvent | StepEvent;

export interface SessionOutputs {
  llmResponse?: string;
  stdout?: string;
  exitCode?: number;
  [key: string]: unknown;
}

export interface SessionTimestamps {
  execStart?: string;
  execEnd?: string;
  llmStart?: string;
  llmEnd?: string;
  [key: string]: string | undefined;
}

export interface Session {
  version: string;
  command_type: CommandType;
  runHash: string;
  recordedAt: string;
  inputs: Record<string, unknown>;
  events: SessionEvent[];
  outputs: SessionOutputs;
  timestamps: SessionTimestamps;
}

export interface HistorySession {
  session: string;
  messages: ChatMessage[];
}

export type HistoryRecord = Record<string, HistorySession>;

// ─── Diff Report Types ───────────────────────────────────────────────────────

export interface DiffLine {
  type: "equal" | "insert" | "delete";
  line: string;
}

export interface ToolCallDiffResult {
  match: boolean;
  summary: string;
}

export interface DiffReport {
  llmMatch: boolean;
  llmDiff: string;
  toolCallsMatch: boolean;
  toolCallsSummary: string;
  stdoutMatch: boolean;
  stdoutDiff: string;
  stepsMatch: boolean;
  stepsSummary: string;
  overall: "REPRODUCIBLE" | "DIVERGED";
}

// ─── Policy Types ────────────────────────────────────────────────────────────

export interface ModelPolicy {
  allow?: string[];
  deny?: string[];
}

export interface ToolPolicy {
  allow?: string[];
  deny?: string[];
}

export interface ExecPolicy {
  deny?: string[];
}

export interface PlanPolicy {
  model?: ModelPolicy;
  tools?: ToolPolicy;
  exec?: ExecPolicy;
}

export interface PlanStep {
  id: string;
  name: string;
  type: "tool" | "exec" | "prompt";
  tool?: string;
  exec?: string;
  args?: Record<string, unknown>;
  context?: { from_steps?: string[] };
  prompt?: string;
  [key: string]: unknown;
}

export interface Plan {
  version?: string;
  name?: string;
  vars?: Record<string, string>;
  model?: { name: string } | string;
  policy?: PlanPolicy;
  steps?: PlanStep[];
  attachments?: string[];
  prompt?: string;
  output?: { format?: string; save?: string };
  outputs?: { save?: { step: string; to: string }[] };
  system?: string;
  flow?: { on_error?: "stop" | "continue" };
}

// ─── CLI and Configuration Types ─────────────────────────────────────────────

export interface CLIOptions {
  // Connection options
  host?: string;
  model?: string;
  user?: string;
  system?: string;

  // File/input options
  files?: string[];
  session: string;
  record?: string;
  history_file: string;
  history_length: number;
  var?: string[];
  shell?: string;
  show?: string;

  // LLM parameters (numeric)
  temperature?: number;
  top_p?: number;
  num_ctx: number;
  timeout: number;

  // Provider/plugins
  provider: Provider;
  tools_dir?: string;
  plugins_dir?: string;
  api_key?: string;

  // Flags
  tags?: string;
  verbose: boolean;
  no_tools: boolean;
  no_plugins: boolean;
  json: boolean;
  stream: boolean;
  stdin: boolean;
  purge: boolean;
  "dry-run": boolean;
  diff: boolean;
  pull?: boolean;
  delete?: boolean;
  "max-upload-file-size"?: number;

  // For model command
  list?: boolean;

  // CLI metadata
  [key: string]: unknown;
}

export interface IEngineHooks {
  init?(): Promise<void>;
  shutdown?(): Promise<void>;
  preProcessPrompt?(requestId: string, raw: string): Promise<string>;
  postProcessPrompt?(requestId: string, assembled: string): Promise<string>;
  gateInference?(
    requestId: string,
    prompt: string,
  ): Promise<{ allowed: boolean; reason?: string }>;
  postProcessInference?(
    requestId: string,
    inferenceResult: unknown,
  ): Promise<unknown>;
  filterResponse?(requestId: string, payload: any): Promise<any>;
  complete?(requestId: string, response: any): Promise<void>;
  onError?(requestId: string, error: Error, phase: string): Promise<void>;
}

export interface IRecorder {
  markExecStart(): void;
  markExecEnd(): void;
  markLlmStart(): void;
  markLlmEnd(): void;
  recordToolCall(
    tool: string,
    args: Record<string, unknown>,
    result: string,
  ): void;
  recordStep(
    stepId: string,
    stepName: string,
    exec: string,
    result: { stdout?: string; stderr?: string; exitCode?: number },
  ): void;
  setOutputs(outputs: SessionOutputs): void;
  save(filePath: string): Promise<void>;
}

// ─── Validation and Argument Types ───────────────────────────────────────────

export interface ToolParameter {
  type: string;
  description?: string;
  required?: boolean;
  enum?: unknown[];
  [key: string]: unknown;
}

export interface ToolDefinition {
  name: string;
  description?: string;
  parameters?: Record<string, ToolParameter>;
  [key: string]: unknown;
}

// ─── Type Guards and Utilities ───────────────────────────────────────────────

export function isToolCallEvent(event: SessionEvent): event is ToolCallEvent {
  return event.type === "tool_call";
}

export function isStepEvent(event: SessionEvent): event is StepEvent {
  return event.type === "step";
}

export function isToolPlugin(plugin: Plugin): plugin is ToolPlugin {
  return plugin.type === "tool";
}

export function isPolicyPlugin(plugin: Plugin): plugin is PolicyPlugin {
  return plugin.type === "policy";
}

export function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof Date) &&
    !(value instanceof Map) &&
    !(value instanceof Set)
  );
}

export function isValidRole(role: unknown): role is MessageRole {
  return (
    typeof role === "string" &&
    ["user", "assistant", "system", "tool"].includes(role)
  );
}

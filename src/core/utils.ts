/**
 * Core utility functions for llmctrlx
 *
 * Security hardening:
 *   - Added validateHistoryPath() to ensure the history file path stays
 *     within an expected base directory, preventing path-traversal reads
 *     and writes via a user-controlled --history flag.
 *   - buildToolPrompt() now accepts an optional `sensitiveParamKeys` set.
 *     Any parameter whose name appears in that set is redacted from the
 *     system prompt so secrets / credentials are not leaked to the LLM.
 */

import fs from "fs";
import path from "path";
import os from "os";
import type { LLMMessage, MessageContent } from "../types.js";

// ---------------------------------------------------------------------------
// Existing utilities (unchanged)
// ---------------------------------------------------------------------------

export interface ChatOpts {
  json?: boolean;
  temperature?: number;
  top_p?: number;
  num_ctx?: number | string;
  timeout?: number | string;
}

/**
 * Build options object for LLM chat requests
 * @param opts - Options object with optional json, temperature, top_p
 */
export function buildOptions(opts: ChatOpts): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (opts.json) out.json = true;
  if (opts.temperature) out.temperature = opts.temperature;
  if (opts.top_p) out.top_p = opts.top_p;
  if (opts.num_ctx) out.num_ctx = parseInt(String(opts.num_ctx), 10);
  if (opts.timeout) out.timeout = parseInt(String(opts.timeout), 10);
  return out;
}

/**
 * Validate that a file doesn't exceed maximum upload size
 * @param {string} file    - File path
 * @param {number} maxSize - Maximum allowed size in bytes
 * @throws {Error} if file size exceeds maximum
 */
export function validateFileSize(file: string, maxSize: number): void {
  const stats = fs.statSync(file);
  if (stats.size > maxSize) {
    throw new Error("File size exceeds the maximum upload file size");
  }
}

/**
 * Check if a file is an image
 * @param {string} file - File path
 * @returns {boolean}
 */
export function isImage(file: string): boolean {
  return [".png", ".jpg", ".jpeg", ".webp"].includes(
    path.extname(file).toLowerCase(),
  );
}

/**
 * Extract JSON from text, handling markdown code blocks and malformed JSON
 * @param text
 */
export function extractJSON(text: string): any {
  const codeBlockMatch = text.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
  if (codeBlockMatch) {
    try {
      return JSON.parse(codeBlockMatch[1]);
    } catch {
      /* fall through */
    }
  }

  let firstBrace = text.indexOf("{");
  if (firstBrace === -1) return null;

  let str = text.slice(firstBrace);
  let depth = 0;
  let lastBrace = -1;

  for (let i = 0; i < str.length; i++) {
    if (str[i] === "{") depth++;
    else if (str[i] === "}") {
      depth--;
      if (depth === 0) {
        lastBrace = i;
        break;
      }
    }
  }

  if (lastBrace !== -1) {
    try {
      return JSON.parse(str.slice(0, lastBrace + 1));
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Validate that tool arguments satisfy the tool's parameter schema
 * @param tool - Tool with parameters schema
 * @param args - Arguments to validate
 * @throws if required arguments are missing
 */
export function validateArgs(
  tool: { parameters?: any },
  args: Record<string, unknown> = {},
): void {
  const schema = tool.parameters;
  if (!schema) return;
  const properties = schema.properties || schema;
  const requiredList = Array.isArray(schema.required) ? schema.required : [];

  for (const key in properties) {
    const isRequired = properties[key].required || requiredList.includes(key);
    if (isRequired && !(key in args)) {
      throw new Error(`Missing required param: ${key}`);
    }
  }
}

/**
 * Validate that a tool object has all required fields
 * @param tool   - Tool to validate
 * @param source - Source file path (for error messages)
 * @throws
 */
export function validateTool(tool: any, source: string): any {
  if (!tool || typeof tool !== "object") {
    throw new Error(`Invalid tool export from ${source}`);
  }
  if (!tool.name || typeof tool.name !== "string") {
    throw new Error(`Tool missing valid 'name' in ${source}`);
  }
  if (!tool.description || typeof tool.description !== "string") {
    throw new Error(`Tool '${tool.name}' missing 'description'`);
  }
  if (!tool.parameters || typeof tool.parameters !== "object") {
    throw new Error(`Tool '${tool.name}' missing 'parameters'`);
  }
  if (typeof tool.run !== "function") {
    throw new Error(`Tool '${tool.name}' missing 'run()'`);
  }
  if (tool.version) {
    if (typeof tool.version !== "string") {
      throw new Error(`Tool '${tool.name}' version must be a string`);
    }
    if (!/^v?[0-9]+\.[0-9]+\.[0-9]+$/.test(tool.version)) {
      throw new Error(
        `Tool '${tool.name}' version must match regex /^v?[0-9]+\\.[0-9]+\\.[0-9]+$/`,
      );
    }
  } else {
    throw new Error(`Tool '${tool.name}' missing version`);
  }
  if (tool.tags !== undefined) {
    if (
      !Array.isArray(tool.tags) ||
      !tool.tags.every((t: any) => typeof t === "string")
    ) {
      throw new Error(`Tool '${tool.name}' tags must be an array of strings`);
    }
  }
  if (tool.policies !== undefined) {
    if (typeof tool.policies !== "object" || Array.isArray(tool.policies)) {
      throw new Error(`Tool '${tool.name}' policies must be an object`);
    }
    if (tool.policies.requires && !Array.isArray(tool.policies.requires)) {
      throw new Error(`Tool '${tool.name}' policies.requires must be an array`);
    }
  }
  return tool;
}

// ---------------------------------------------------------------------------
// New: history-path confinement
// ---------------------------------------------------------------------------

/**
 * The default allowed base directory for history files.
 * Override by passing a custom `allowedBase` to validateHistoryPath().
 * This function is not called by llmctrlx as it is undecided how best to support this feature.
 */
const DEFAULT_HISTORY_BASE = path.resolve(os.homedir());

/**
 * Validate that a history file path resolves inside `allowedBase`.
 *
 * Call this before passing any user-supplied history path to loadHistory()
 * or saveHistory() to prevent path-traversal attacks.
 *
 * @param {string} filePath    - The path to validate.
 * @param {string} [allowedBase] - The directory the file must reside in.
 *                                 Defaults to ~/.llmctrlx.
 * @returns {string} The resolved, safe absolute path.
 * @throws {Error}  If the resolved path escapes allowedBase.
 */
export function validateHistoryPath(
  filePath: string,
  allowedBase: string = DEFAULT_HISTORY_BASE,
): string {
  const resolvedBase = path.resolve(allowedBase);
  const resolvedFile = path.resolve(filePath);

  if (
    !resolvedFile.startsWith(resolvedBase + path.sep) &&
    resolvedFile !== resolvedBase
  ) {
    throw new Error(
      `History file path '${filePath}' is outside the allowed directory '${resolvedBase}'.`,
    );
  }

  return resolvedFile;
}

// ---------------------------------------------------------------------------
// Updated: buildToolPrompt with parameter redaction
// ---------------------------------------------------------------------------

/**
 * Parameter names that will be redacted from the tool system prompt.
 * Add any key that may hold credentials, tokens, or internal configuration.
 *
 * Tool authors can also declare `sensitive: true` on individual parameter
 * definitions to opt in to redaction.
 */
const DEFAULT_SENSITIVE_PARAM_KEYS = new Set([
  "password",
  "passwd",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "auth",
  "credential",
  "private_key",
  "access_key",
  "access_token",
  "refresh_token",
  "session_token",
  "bearer",
]);

/**
 * Produce a redacted copy of a parameter schema for inclusion in a prompt.
 *
 * Properties whose names (lowercased) match `sensitiveKeys`, or whose
 * definition has `sensitive: true`, are replaced with a placeholder.
 *
 * @param parameters       - Raw parameter schema.
 * @param sensitiveKeys
 */
function redactParameters(
  parameters: any,
  sensitiveKeys: Set<string>,
): Record<string, unknown> | null {
  if (!parameters || typeof parameters !== "object") return parameters;

  const properties = parameters.properties || parameters;
  const redacted: Record<string, unknown> = {};

  for (const [key, def] of Object.entries(properties) as [string, any][]) {
    if (sensitiveKeys.has(key.toLowerCase()) || def?.sensitive === true) {
      redacted[key] = {
        type: def?.type || "string",
        description: "[redacted]",
      };
    } else {
      redacted[key] = def;
    }
  }

  // Preserve the top-level schema shape (required, etc.)
  if (parameters.properties) {
    return { ...parameters, properties: redacted };
  }
  return redacted;
}

/**
 * Build the system prompt that instructs the model on tool usage.
 *
 * @param tools             - Array of available tools.
 * @param [sensitiveKeys]   - Additional sensitive param names to redact.
 */
export function buildToolPrompt(
  tools: any[],
  sensitiveKeys: Set<string> = new Set(),
): string {
  const allSensitiveKeys = new Set([
    ...DEFAULT_SENSITIVE_PARAM_KEYS,
    ...Array.from(sensitiveKeys).map((k) => k.toLowerCase()),
  ]);

  return `
You MUST respond with ONLY valid JSON when calling a tool.
Do not include any explanation, text, or markdown.

Tool usage strategy:
1. Do not repeat identical tool calls with the same arguments.
2. If a tool fails or returns no useful information, try a different approach or tool.
3. For system command research: use \`apropos\` to discover commands, \`whatis\` to confirm purpose, and \`man\` only for deeper details.

If no tool is needed, respond normally.

Tool call format:
{
  "tool": "tool_name",
  "arguments": { ... }
}

Available tools:
${tools
  .map((t) => {
    const safeParams = redactParameters(t.parameters, allSensitiveKeys);
    return `
- ${t.name}: ${t.description}
  parameters: ${JSON.stringify(safeParams)}
`;
  })
  .join("\n")}
`;
}

/**
 * Build an image message in the correct format for the active provider.
 *
 * @param filePath - Path to the image file
 * @param imgData  - Base64-encoded image data
 * @param provider - 'lmstudio' | 'ollama'
 */
export function buildImageMessage(
  filePath: string,
  imgData: string,
  provider: string,
): LLMMessage {
  const label = `Attached image: ${path.basename(filePath)}`;

  if (provider === "lmstudio") {
    const ext = path.extname(filePath).slice(1).toLowerCase();
    const mimeType = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    return {
      role: "user",
      content: [
        {
          type: "image_url",
          image_url: { url: `data:${mimeType};base64,${imgData}` },
        },
        { type: "text", text: label },
      ] as MessageContent[],
    };
  }

  // Ollama default
  return {
    role: "user",
    content: label,
    images: [imgData],
  } as unknown as LLMMessage;
}

/**
 * Compact consecutive messages of the same role by merging their content.
 *
 * @param {Array} messages - Message array to compact.
 * @returns {Array} New compacted message array.
 */
export function compactMessages(messages: LLMMessage[]): LLMMessage[] {
  if (!messages || messages.length === 0) return [];

  const compacted: LLMMessage[] = [];
  let current: LLMMessage | null = null;

  for (const msg of messages) {
    if (!current || current.role !== msg.role) {
      current = { ...msg };
      compacted.push(current);
    } else {
      // Merge content
      if (
        typeof current.content === "string" &&
        typeof msg.content === "string"
      ) {
        current.content += "\n\n" + msg.content;
      } else if (Array.isArray(current.content) && Array.isArray(msg.content)) {
        current.content.push(...msg.content);
      } else if (
        Array.isArray(current.content) &&
        typeof msg.content === "string"
      ) {
        (current.content as MessageContent[]).push({
          type: "text",
          text: msg.content,
        });
      } else if (
        typeof current.content === "string" &&
        Array.isArray(msg.content)
      ) {
        current.content = [
          { type: "text", text: current.content },
          ...msg.content,
        ] as MessageContent[];
      }

      // Merge images if present
      if ((msg as any).images) {
        (current as any).images = [
          ...((current as any).images || []),
          ...(msg as any).images,
        ];
      }
    }
  }

  return compacted;
}

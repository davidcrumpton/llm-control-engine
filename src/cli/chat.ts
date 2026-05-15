/**
 * Chat command handler for llmctrlx
 *
 * Extended with optional --record <file> support.
 * When --record is set a Recorder captures the inputs, every tool call
 * (via the onToolCall hook threaded into runWithTools), and the final
 * LLM response, then writes a self-contained session JSON file.
 */

import fs from "fs/promises";
import {
  loadHistory,
  saveHistory,
  getSession,
  getHistoryWindow,
} from "../core/history.js";
import {
  buildOptions,
  isImage,
  validateFileSize,
  buildToolPrompt,
  buildImageMessage,
  compactMessages,
} from "../core/utils.js";
import {
  createPluginRegistry,
  runWithTools,
  runWithoutTools,
} from "../core/tools.js";
import { Recorder, makeToolCallRecorder } from "../core/recorder.js";
import type { CLIOptions, LLMProvider, LLMMessage } from "../types.js";

// ─── Main command ─────────────────────────────────────────────────────────────

/**
 * Handle chat command
 *
 * @param {Object} llm                - LLM provider instance
 * @param {Object} options            - CLI options (includes options.record)
 * @param {string} defaultHistoryFile - Path to the history JSON file
 * @param {string|null} toolsDir      - Tools directory
 * @param {number} maxUploadFileSize  - Maximum file attachment size in bytes
 * @param {Object} engineHooks        - Optional engine hook system
 */
export async function cmdChat(
  llm: LLMProvider,
  options: CLIOptions,
  defaultHistoryFile: string,
  toolsDir: string | null,
  maxUploadFileSize: number,
  engineHooks?: any,
) {
  const recordFile = options.record ?? null;

  const historyData = loadHistory(defaultHistoryFile);
  const sessionKey = options.session || options.show;
  if (!sessionKey) return;
  const session = getSession(historyData, sessionKey);

  // 1. Prepare Input
  const userContent = await resolveUserContent(options);
  if (!userContent) {
    throw new Error("Error: No input provided via CLI or stdin.");
  }

  // 2. Build Message Context
  // Capture the history window before building messages so we can snapshot it
  // into recorderInputs — replay needs the exact slice, not just the session name,
  // because live history grows between recording and replay.
  const historyWindow = getHistoryWindow(session, options.history_length);

  const fileMessages = await processFiles(
    options.files,
    maxUploadFileSize,
    options.provider,
  );
  const messages = compactMessages([
    ...(options.system
      ? [{ role: "system" as const, content: options.system }]
      : []),
    ...historyWindow,
    ...fileMessages,
    { role: "user" as const, content: userContent },
  ]);

  // 3. Build recorder (inputs captured before execution)
  const recorderInputs = {
    model: options.model,
    parameters: {
      temperature: options.temperature,
      top_p: options.top_p,
      num_ctx: options.num_ctx,
    },
    system: options.system ?? null,
    user: userContent,
    session: options.session ?? null,
    history_length: options.history_length ?? null,
    history_snapshot: historyWindow, // exact slice injected — makes replay self-contained
    toolsDir: toolsDir ?? null,
    tags: options.tags ?? null,
    stream: options.stream ?? false,
    no_tools: options.no_tools ?? false,
  };

  const recorder = recordFile
    ? new Recorder("chat", recorderInputs as any)
    : null;

  // 4. Execute LLM Request
  const chatOptions = buildOptions(options);

  // Attach the recorder's tool-call hook so every tool invocation is captured
  if (recorder) {
    chatOptions.onToolCall = makeToolCallRecorder(recorder);
    recorder.markLlmStart();
  }

  let assistantResponse = "";

  try {
    if (options.stream) {
      assistantResponse = await handleStreamingChat(
        llm,
        options,
        messages,
        chatOptions,
      );
    } else {
      assistantResponse = await handleStandardChat(
        llm,
        options,
        messages,
        chatOptions,
        toolsDir ?? undefined,
      );
    }

    if (recorder) recorder.markLlmEnd();

    // 5. Post-processing & Persistence
    const filtered = await filterResponse(
      assistantResponse,
      engineHooks,
      options,
      userContent,
    );
    if (!options.stream) console.log(filtered);

    session.messages.push({ role: "user", content: userContent });
    session.messages.push({ role: "assistant", content: filtered });
    saveHistory(defaultHistoryFile, historyData);

    // 6. Save session recording
    if (recorder && recordFile) {
      recorder.setOutputs({ llmResponse: filtered });
      await recorder.save(recordFile);
      console.error(`[record] session saved → ${recordFile}`);
    }
  } catch (err) {
    if (recorder && recordFile) {
      recorder.markLlmEnd();
      recorder.setOutputs({ llmResponse: "", error: (err as Error).message });
      try {
        await recorder.save(recordFile);
        console.error(`[record] partial session saved → ${recordFile}`);
      } catch {
        // ignore save errors on failure path
      }
    }
    throw err;
  }
}

// ─── Private helpers (unchanged from original) ────────────────────────────────

async function resolveUserContent(options: CLIOptions): Promise<string> {
  let stdinData = "";
  if (options.stdin || (!options.user && !process.stdin.isTTY)) {
    stdinData = await new Promise((resolve) => {
      let data = "";
      process.stdin.on("data", (chunk) => (data += chunk));
      process.stdin.on("end", () => resolve(data.trim()));
    });
    if (options.stdin && !stdinData && process.stdin.isTTY) {
      throw new Error("--stdin specified but no input detected");
    }
  }

  const parts = [options.user, stdinData].filter(Boolean);
  return parts.join("\n\n");
}

async function processFiles(
  filesInput: string[] | string | undefined,
  maxSize: number,
  provider: string = "ollama",
): Promise<LLMMessage[]> {
  const files = Array.isArray(filesInput)
    ? filesInput
    : filesInput
      ? [filesInput]
      : [];
  const msgs = [];

  for (const file of files) {
    validateFileSize(file, maxSize);
    if (isImage(file)) {
      const img = (await fs.readFile(file)).toString("base64");
      msgs.push(buildImageMessage(file, img, provider.toLowerCase()));
    } else {
      const content = await fs.readFile(file, "utf8");
      msgs.push({
        role: "user" as const,
        content: `File: ${file}\n${content}`,
      });
    }
  }
  return msgs;
}

async function handleStandardChat(
  llm: LLMProvider,
  options: CLIOptions,
  messages: LLMMessage[],
  chatOptions: any,
  toolsDir: string | undefined,
): Promise<string> {
  if (options.no_tools) {
    return await runWithoutTools(llm, options.model!, messages, chatOptions);
  }

  const registry = await createPluginRegistry(toolsDir, options.session);
  const requestedTags = options.tags
    ? options.tags
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
    : null;

  let tools = registry.list("tool");
  if (requestedTags) {
    tools = tools.filter(
      (t) =>
        (t.tags || []).includes("always") ||
        requestedTags.some((tag) => (t.tags || []).includes(tag)),
    );
  }

  if (tools.length > 0) {
    messages.unshift({ role: "system", content: buildToolPrompt(tools) });
  }
  return await runWithTools(
    llm,
    options.model!,
    messages,
    tools,
    registry.list("policy"),
    chatOptions,
  );
}

async function handleStreamingChat(
  llm: LLMProvider,
  options: CLIOptions,
  messages: LLMMessage[],
  chatOptions: any,
): Promise<string> {
  // Strip recorder-specific keys before forwarding to provider
  const { onToolCall, ...providerOptions } = chatOptions;

  if (onToolCall) {
    providerOptions.onToolCall = onToolCall;
  }
  const stream = await llm.chat({
    model: options.model!,
    messages,
    stream: true,
    options: providerOptions,
  });

  if (!(Symbol.asyncIterator in stream)) {
    throw new Error("Provider did not return a stream");
  }

  let fullContent = "";
  for await (const chunk of stream) {
    const content = chunk.message?.content || "";
    process.stdout.write(content);
    fullContent += content;
  }
  process.stdout.write("\n");
  return fullContent;
}

async function filterResponse(
  output: string,
  engineHooks: any,
  options: CLIOptions,
  prompt: string,
): Promise<string> {
  if (typeof engineHooks?.filterResponse !== "function") return output;

  const result = await engineHooks.filterResponse("chat", {
    output,
    content: output, // Alias for backward compatibility
    prompt,
    requestId: options.session || "default",
    filtered: false,
    requestMeta: { flags: options },
  });

  return result.output || result.content;
}

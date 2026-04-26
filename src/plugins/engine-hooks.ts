/**
 * @module plugins/engine-hooks
 * Integrates the HookManager into the LLM Control Engine lifecycle.
 *
 * Usage:
 *   const hooks = new EngineHookIntegration(hookManager);
 *   const prompt  = await hooks.preProcessPrompt(requestId, rawPrompt);
 *   const gated   = await hooks.gateInference(requestId, prompt);
 *   const output  = await hooks.postProcessInference(requestId, rawOutput);
 *   const final   = await hooks.filterResponse(requestId, output.output);
 *   await hooks.complete(requestId, final);
 */

import { HookManager } from "./hook-manager.js";
import { HookContext, HookMeta } from "./types.js";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Payload types
// ---------------------------------------------------------------------------

export interface PromptPayload {
  raw: string;
  processed: string;
  model?: string;
  parameters?: Record<string, unknown>;
}

export interface InferencePayload {
  prompt: string;
  output: string;
  tokenUsage?: { prompt: number; completion: number; total: number };
  latencyMs?: number;
}

export interface ResponsePayload {
  content: string;
  filtered: boolean;
  filterReasons?: string[];
}

export interface ErrorPayload {
  error: Error;
  phase: string;
  requestId: string;
}

// ---------------------------------------------------------------------------
// EngineHookIntegration
// ---------------------------------------------------------------------------

export class EngineHookIntegration {
  constructor(private hooks: HookManager) {}

  private makeMeta(event: HookMeta["event"], requestId?: string): HookMeta {
    return {
      requestId: requestId ?? randomUUID(),
      timestamp: new Date().toISOString(),
      event,
    };
  }

  private ctx<T>(
    event: HookMeta["event"],
    data: T,
    requestId?: string,
  ): HookContext<T> {
    return { data, meta: this.makeMeta(event, requestId) };
  }

  // -- Lifecycle methods ---------------------------------------------------

  async init(): Promise<void> {
    await this.hooks.parallel("engine:init", this.ctx("engine:init", {}));
  }

  async shutdown(): Promise<void> {
    await this.hooks.parallel(
      "engine:shutdown",
      this.ctx("engine:shutdown", {}),
    );
  }

  async preProcessPrompt(requestId: string, raw: string): Promise<string> {
    const payload: PromptPayload = { raw, processed: raw };
    const result = await this.hooks.waterfall(
      "prompt:pre-process",
      this.ctx("prompt:pre-process", payload, requestId),
    );
    return result.data.processed;
  }

  async postProcessPrompt(
    requestId: string,
    assembled: string,
  ): Promise<string> {
    const payload: PromptPayload = { raw: assembled, processed: assembled };
    const result = await this.hooks.waterfall(
      "prompt:post-process",
      this.ctx("prompt:post-process", payload, requestId),
    );
    return result.data.processed;
  }

  async gateInference(
    requestId: string,
    prompt: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const bailed = await this.hooks.bail(
      "inference:pre",
      this.ctx("inference:pre", { prompt }, requestId),
    );

    if (bailed?.bail) {
      return { allowed: false, reason: bailed.reason };
    }
    return { allowed: true };
  }

  async postProcessInference(
    requestId: string,
    inferenceResult: InferencePayload,
  ): Promise<InferencePayload> {
    const result = await this.hooks.waterfall(
      "inference:post",
      this.ctx("inference:post", inferenceResult, requestId),
    );
    return result.data;
  }

  async filterResponse(
    requestId: string,
    payload: ResponsePayload,
  ): Promise<ResponsePayload> {
    const result = await this.hooks.waterfall(
      "response:filter",
      this.ctx("response:filter", payload, requestId),
    );
    return result.data;
  }

  async complete(requestId: string, response: ResponsePayload): Promise<void> {
    await this.hooks.parallel(
      "response:complete",
      this.ctx("response:complete", response, requestId),
    );
  }

  async onError(requestId: string, error: Error, phase: string): Promise<void> {
    const payload: ErrorPayload = { error, phase, requestId };
    await this.hooks.parallel(
      "engine:error",
      this.ctx("engine:error", payload, requestId),
    );
  }
}

/**
 * @module plugins
 * Barrel exports for the hook plugin system.
 */

export { HOOK_EVENTS, HookPriority } from "./types.js";
export type {
  HookEvent,
  HookMeta,
  HookContext,
  HookResult,
  HookHandler,
  HookRegistration,
  PluginMeta,
  HookPlugin,
  TapFunction,
} from "./types.js";

export { HookManager } from "./hook-manager.js";
export type { HookLogger } from "./hook-manager.js";
export { PluginLoader } from "./plugin-loader.js";
export type { LoaderOptions } from "./plugin-loader.js";

export { EngineHookIntegration } from "./engine-hooks.js";
export type {
  PromptPayload,
  InferencePayload,
  ResponsePayload,
  ErrorPayload,
} from "./engine-hooks.js";

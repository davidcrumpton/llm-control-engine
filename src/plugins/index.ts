/**
 * @module plugins
 * Barrel exports for the hook plugin system.
 */

export {
  HOOK_EVENTS,
  HookEvent,
  HookPriority,
  HookMeta,
  HookContext,
  HookResult,
  HookHandler,
  HookRegistration,
  PluginMeta,
  HookPlugin,
  TapFunction,
  // @ts-ignore
} from "./types.ts";

// @ts-ignore
export { HookManager, HookLogger } from "./hook-manager.ts";
// @ts-ignore
export { PluginLoader, LoaderOptions } from "./plugin-loader.ts";

export {
  EngineHookIntegration,
  PromptPayload,
  InferencePayload,
  ResponsePayload,
  ErrorPayload,
  // @ts-ignore
} from "./engine-hooks.ts";

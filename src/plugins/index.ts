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
} from './types.js';

export { HookManager, HookLogger } from './hook-manager.js';
export { PluginLoader, LoaderOptions } from './plugin-loader.js';

export {
  EngineHookIntegration,
  PromptPayload,
  InferencePayload,
  ResponsePayload,
  ErrorPayload,
} from './engine-hooks.js';
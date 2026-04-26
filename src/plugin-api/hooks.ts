/**
 * @module plugin-api/hooks
 * Stable public API for LLM Control Engine plugins.
 *
 * This module provides the essential constants and types that plugins
 * need to interact with the hook system. All exports are stable and
 * will not change in breaking ways.
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
} from "../plugins/types.js";

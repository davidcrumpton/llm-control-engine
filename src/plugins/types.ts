/**
 * @module plugins/types
 * Core type definitions for the LLM Control Engine hook plugin system.
 *
 * Hook Execution Modes:
 *   - Waterfall: Each handler receives the previous handler's output.
 *   - Bail: First non-null return short-circuits remaining handlers.
 *   - Parallel: All handlers fire concurrently (side-effects only).
 */

// ---------------------------------------------------------------------------
// Hook Events
// ---------------------------------------------------------------------------

export const HOOK_EVENTS = [
  "engine:init",
  "engine:shutdown",
  "prompt:pre-process",
  "prompt:post-process",
  "inference:pre",
  "inference:post",
  "response:filter",
  "response:complete",
  "engine:error",
] as const;

export type HookEvent = (typeof HOOK_EVENTS)[number];

// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------

export enum HookPriority {
  /** Reserved for engine internals. Runs first. */
  SYSTEM = 0,
  /** High-priority plugins (security, auth). */
  HIGH = 100,
  /** Default priority for most plugins. */
  NORMAL = 500,
  /** Low-priority plugins (analytics, logging). */
  LOW = 900,
  /** Monitor-only. Runs last, cannot mutate. */
  MONITOR = 1000,
}

// ---------------------------------------------------------------------------
// Context & Result
// ---------------------------------------------------------------------------

export interface HookMeta {
  requestId: string;
  timestamp: string;
  event: HookEvent;
}

export interface HookContext<T = unknown> {
  data: T;
  meta: Readonly<HookMeta>;
}

export interface HookResult<T = unknown> {
  data?: T;
  bail?: boolean;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Handler & Registration
// ---------------------------------------------------------------------------

export type HookHandler<T = unknown> = (
  context: HookContext<T>,
) => Promise<HookResult<T> | void>;

export interface HookRegistration<T = unknown> {
  id: string;
  pluginName: string;
  event: HookEvent;
  priority: HookPriority;
  handler: HookHandler<T>;
}

// ---------------------------------------------------------------------------
// Plugin Interface
// ---------------------------------------------------------------------------

export interface PluginMeta {
  name: string;
  version: string;
  description: string;
  author?: string;
  engineVersion?: string;
}

/**
 * The contract every hook plugin must implement.
 *
 * Lifecycle:
 *   1. `meta` is read at load time for validation.
 *   2. `install(tap)` is called once — use `tap` to register handlers.
 *   3. `uninstall()` is called on teardown (optional cleanup).
 */
export interface HookPlugin {
  readonly meta: PluginMeta;

  /**
   * Called once when the plugin is registered.
   * Use the `tap` helper to subscribe to hook events.
   */
  install(tap: TapFunction): void | Promise<void>;

  /**
   * Optional teardown (close connections, flush buffers, etc.).
   */
  uninstall?(): void | Promise<void>;
}

export type TapFunction = <T = unknown>(
  event: HookEvent,
  handler: HookHandler<T>,
  priority?: HookPriority,
) => void;

// ---------------------------------------------------------------------------
// Unified Plugin Interface (Experimental)
// ---------------------------------------------------------------------------

export interface UnifiedPluginMeta {
  name: string;
  version: string;
  description: string;
  tags?: string[];
  type?: "tool" | "policy" | "provider" | "hook";
}

export interface UnifiedPluginResult {
  outcome?: "modified" | "blocked" | "unchanged";
  data?: unknown;
  reason?: string;
}

export interface UnifiedPluginRunArgs {
  event: HookEvent;
  data: unknown;
  parameters: Record<string, unknown>;
  meta: Readonly<HookMeta>;
}

/**
 * Unified plugin interface — experimental, not yet fully supported.
 */
export interface UnifiedPlugin {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly tags?: string[];
  readonly type?: "tool" | "policy" | "provider" | "hook";
  readonly parameters?: Record<string, unknown>;

  /**
   * Single execution entry point for all events.
   */
  run(args: UnifiedPluginRunArgs): Promise<UnifiedPluginResult | void>;
}

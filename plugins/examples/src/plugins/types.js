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
];
// ---------------------------------------------------------------------------
// Priority
// ---------------------------------------------------------------------------
export var HookPriority;
(function (HookPriority) {
    /** Reserved for engine internals. Runs first. */
    HookPriority[HookPriority["SYSTEM"] = 0] = "SYSTEM";
    /** High-priority plugins (security, auth). */
    HookPriority[HookPriority["HIGH"] = 100] = "HIGH";
    /** Default priority for most plugins. */
    HookPriority[HookPriority["NORMAL"] = 500] = "NORMAL";
    /** Low-priority plugins (analytics, logging). */
    HookPriority[HookPriority["LOW"] = 900] = "LOW";
    /** Monitor-only. Runs last, cannot mutate. */
    HookPriority[HookPriority["MONITOR"] = 1000] = "MONITOR";
})(HookPriority || (HookPriority = {}));

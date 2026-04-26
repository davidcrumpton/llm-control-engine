/**
 * @module plugins/hook-manager
 * Runtime hook manager — the central nervous system of the plugin architecture.
 *
 * Responsibilities:
 *   - Ordered registry of hook handlers per event.
 *   - Execute handlers in waterfall, bail, or parallel mode.
 *   - Isolate errors: a failing plugin never crashes the engine.
 */

import {
  HookEvent,
  HookContext,
  HookResult,
  HookHandler,
  HookPriority,
  HookRegistration,
  HookPlugin,
  TapFunction,
} from "./types.js";

// ---------------------------------------------------------------------------
// Logger interface (dependency-free)
// ---------------------------------------------------------------------------

export interface HookLogger {
  debug(msg: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
}

const noopLogger: HookLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

// ---------------------------------------------------------------------------
// HookManager
// ---------------------------------------------------------------------------

export class HookManager {
  private registry = new Map<HookEvent, HookRegistration[]>();
  private plugins = new Map<string, HookPlugin>();
  private logger: HookLogger;
  private idCounter = 0;

  constructor(logger?: HookLogger) {
    this.logger = logger ?? noopLogger;
  }

  // -- Plugin lifecycle ----------------------------------------------------

  async register(plugin: HookPlugin): Promise<void> {
    const { name } = plugin.meta;

    if (this.plugins.has(name)) {
      throw new Error(`[HookManager] Plugin "${name}" is already registered.`);
    }

    const tap: TapFunction = <T = unknown>(
      event: HookEvent,
      handler: HookHandler<T>,
      priority: HookPriority = HookPriority.NORMAL,
    ) => {
      this.addRegistration<T>({
        id: `${name}::${event}::${++this.idCounter}`,
        pluginName: name,
        event,
        priority,
        handler,
      });
    };

    await plugin.install(tap);
    this.plugins.set(name, plugin);
    this.logger.info(
      `[HookManager] Registered plugin: ${name} v${plugin.meta.version}`,
    );
  }

  async unregister(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      this.logger.warn(
        `[HookManager] Cannot unregister unknown plugin: ${name}`,
      );
      return;
    }

    await plugin.uninstall?.();

    for (const [event, registrations] of this.registry) {
      this.registry.set(
        event,
        registrations.filter((r) => r.pluginName !== name),
      );
    }

    this.plugins.delete(name);
    this.logger.info(`[HookManager] Unregistered plugin: ${name}`);
  }

  listPlugins(): string[] {
    return [...this.plugins.keys()];
  }

  // -- Execution modes -----------------------------------------------------

  async waterfall<T>(
    event: HookEvent,
    context: HookContext<T>,
  ): Promise<HookContext<T>> {
    const handlers = this.getHandlers(event);
    let current = { ...context };

    for (const reg of handlers) {
      try {
        const result = await (reg.handler as HookHandler<T>)(current);
        if (result?.data !== undefined) {
          current = { ...current, data: result.data };
        }
      } catch (err) {
        this.logger.error(
          `[HookManager] Error in ${reg.id} during "${event}":`,
          err,
        );
      }
    }

    return current;
  }

  async bail<T>(
    event: HookEvent,
    context: HookContext<T>,
  ): Promise<HookResult<T> | null> {
    const handlers = this.getHandlers(event);

    for (const reg of handlers) {
      try {
        const result = await (reg.handler as HookHandler<T>)(context);
        if (result?.bail) {
          this.logger.info(
            `[HookManager] Bail triggered by ${reg.id}: ${result.reason ?? "no reason"}`,
          );
          return result;
        }
      } catch (err) {
        this.logger.error(
          `[HookManager] Error in ${reg.id} during "${event}":`,
          err,
        );
      }
    }

    return null;
  }

  async parallel<T>(event: HookEvent, context: HookContext<T>): Promise<void> {
    const handlers = this.getHandlers(event);

    const tasks = handlers.map(async (reg) => {
      try {
        await (reg.handler as HookHandler<T>)(context);
      } catch (err) {
        this.logger.error(
          `[HookManager] Error in ${reg.id} during "${event}":`,
          err,
        );
      }
    });

    await Promise.allSettled(tasks);
  }

  // -- Internals -----------------------------------------------------------

  private addRegistration<T>(registration: HookRegistration<T>): void {
    const list = this.registry.get(registration.event) ?? [];
    list.push(registration as HookRegistration);
    list.sort((a, b) => a.priority - b.priority);
    this.registry.set(registration.event, list);

    this.logger.debug(
      `[HookManager] Tapped "${registration.event}" by ${registration.pluginName} ` +
        `(priority ${registration.priority})`,
    );
  }

  private getHandlers(event: HookEvent): HookRegistration[] {
    return this.registry.get(event) ?? [];
  }
}

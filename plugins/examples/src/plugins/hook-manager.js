/**
 * @module plugins/hook-manager
 * Runtime hook manager — the central nervous system of the plugin architecture.
 *
 * Responsibilities:
 *   - Ordered registry of hook handlers per event.
 *   - Execute handlers in waterfall, bail, or parallel mode.
 *   - Isolate errors: a failing plugin never crashes the engine.
 */
import { HookPriority, } from "./types.js";
const noopLogger = {
    debug: () => { },
    info: () => { },
    warn: () => { },
    error: () => { },
};
// ---------------------------------------------------------------------------
// HookManager
// ---------------------------------------------------------------------------
export class HookManager {
    registry = new Map();
    plugins = new Map();
    logger;
    idCounter = 0;
    constructor(logger) {
        this.logger = logger ?? noopLogger;
    }
    // -- Plugin lifecycle ----------------------------------------------------
    async register(plugin) {
        const { name } = plugin.meta;
        if (this.plugins.has(name)) {
            throw new Error(`[HookManager] Plugin "${name}" is already registered.`);
        }
        const tap = (event, handler, priority = HookPriority.NORMAL) => {
            this.addRegistration({
                id: `${name}::${event}::${++this.idCounter}`,
                pluginName: name,
                event,
                priority,
                handler,
            });
        };
        await plugin.install(tap);
        this.plugins.set(name, plugin);
        this.logger.info(`[HookManager] Registered plugin: ${name} v${plugin.meta.version}`);
    }
    async unregister(name) {
        const plugin = this.plugins.get(name);
        if (!plugin) {
            this.logger.warn(`[HookManager] Cannot unregister unknown plugin: ${name}`);
            return;
        }
        await plugin.uninstall?.();
        for (const [event, registrations] of this.registry) {
            this.registry.set(event, registrations.filter((r) => r.pluginName !== name));
        }
        this.plugins.delete(name);
        this.logger.info(`[HookManager] Unregistered plugin: ${name}`);
    }
    listPlugins() {
        return [...this.plugins.keys()];
    }
    // -- Execution modes -----------------------------------------------------
    async waterfall(event, context) {
        const handlers = this.getHandlers(event);
        let current = { ...context };
        for (const reg of handlers) {
            try {
                const result = await reg.handler(current);
                if (result?.data !== undefined) {
                    current = { ...current, data: result.data };
                }
            }
            catch (err) {
                this.logger.error(`[HookManager] Error in ${reg.id} during "${event}":`, err);
            }
        }
        return current;
    }
    async bail(event, context) {
        const handlers = this.getHandlers(event);
        for (const reg of handlers) {
            try {
                const result = await reg.handler(context);
                if (result?.bail) {
                    this.logger.info(`[HookManager] Bail triggered by ${reg.id}: ${result.reason ?? "no reason"}`);
                    return result;
                }
            }
            catch (err) {
                this.logger.error(`[HookManager] Error in ${reg.id} during "${event}":`, err);
            }
        }
        return null;
    }
    async parallel(event, context) {
        const handlers = this.getHandlers(event);
        const tasks = handlers.map(async (reg) => {
            try {
                await reg.handler(context);
            }
            catch (err) {
                this.logger.error(`[HookManager] Error in ${reg.id} during "${event}":`, err);
            }
        });
        await Promise.allSettled(tasks);
    }
    // -- Internals -----------------------------------------------------------
    addRegistration(registration) {
        const list = this.registry.get(registration.event) ?? [];
        list.push(registration);
        list.sort((a, b) => a.priority - b.priority);
        this.registry.set(registration.event, list);
        this.logger.debug(`[HookManager] Tapped "${registration.event}" by ${registration.pluginName} ` +
            `(priority ${registration.priority})`);
    }
    getHandlers(event) {
        return this.registry.get(event) ?? [];
    }
}

# Plugin System — LLM Control Engine

Event-based hook architecture for extending the LLM Control Engine
without modifying core code.

## Quick Start

```typescript
import { HookManager, PluginLoader, EngineHookIntegration } from './src/plugins';

// 1. Create the manager
const manager = new HookManager(console);

// 2. Load plugins from a directory
const loader = new PluginLoader(manager, console);
await loader.loadFromDirectory('./plugins');

// 3. Wire into the engine lifecycle
const engine = new EngineHookIntegration(manager);
await engine.init();

// 4. Use in your request cycle
const prompt  = await engine.preProcessPrompt(requestId, userInput);
const gate    = await engine.gateInference(requestId, prompt);
if (!gate.allowed) throw new Error(gate.reason);
// ... run inference ...
const output  = await engine.postProcessInference(requestId, result);
const final   = await engine.filterResponse(requestId, output.output);
await engine.complete(requestId, final);
```

## Hook Events

| Event | Mode | Description |
|---|---|---|
| `engine:init` | Parallel | Engine startup and plugin initialization |
| `engine:shutdown` | Parallel | Graceful shutdown notification |
| `prompt:pre-process` | Waterfall | Transform raw user prompt |
| `prompt:post-process` | Waterfall | Transform assembled prompt |
| `inference:pre` | Bail | Gate: block or allow inference |
| `inference:post` | Waterfall | Transform model output |
| `response:filter` | Waterfall | Content filtering |
| `response:complete` | Parallel | Observe completed cycle |
| `engine:error` | Parallel | Error notification |

## Execution Modes

### Waterfall
Each handler receives the previous handler's output. Return `{ data }`
to pass a modified payload downstream. Omit `data` to pass through
unchanged.

### Bail
Handlers run sequentially. Return `{ bail: true, reason: '...' }` to
short-circuit. If no handler bails, the operation proceeds.

### Parallel
All handlers fire concurrently via `Promise.allSettled`. Used for
side-effects (logging, metrics). Return values are ignored.

## Writing a Plugin

```typescript
import { HookPlugin, HookPriority } from './src/plugins';

const myPlugin: HookPlugin = {
  meta: {
    name: 'my-plugin',
    version: '0.1.0',
    description: 'Does something useful.',
  },

  install(tap) {
    tap('prompt:pre-process', async (ctx) => {
      const modified = ctx.data.processed.trim();
      return { data: { ...ctx.data, processed: modified } };
    }, HookPriority.NORMAL);
  },
};

export default myPlugin;
```

### File Naming

Files must end with `.plugin.ts` or `.plugin.js`.

### Priority Levels

| Level | Value | Use Case |
|---|---|---|
| `SYSTEM` | 0 | Engine internals only |
| `HIGH` | 100 | Security, auth, guards |
| `NORMAL` | 500 | General-purpose plugins |
| `LOW` | 900 | Analytics, logging |
| `MONITOR` | 1000 | Read-only observers |

## API Reference

### HookManager

| Method | Description |
|---|---|
| `register(plugin)` | Register and install a plugin |
| `unregister(name)` | Teardown and remove a plugin |
| `listPlugins()` | List registered plugin names |
| `waterfall(event, ctx)` | Run waterfall execution |
| `bail(event, ctx)` | Run bail execution |
| `parallel(event, ctx)` | Run parallel execution |

### PluginLoader

| Method | Description |
|---|---|
| `loadFromDirectory(dir)` | Discover and load plugins from dir |
| `loadPlugin(path)` | Load a single plugin file |

### EngineHookIntegration

| Method | Description |
|---|---|
| `init()` | Fire `engine:init` |
| `shutdown()` | Fire `engine:shutdown` |
| `preProcessPrompt(id, raw)` | Waterfall `prompt:pre-process` |
| `postProcessPrompt(id, assembled)` | Waterfall `prompt:post-process` |
| `gateInference(id, prompt)` | Bail `inference:pre` |
| `postProcessInference(id, result)` | Waterfall `inference:post` |
| `filterResponse(id, content)` | Waterfall `response:filter` |
| `complete(id, response)` | Parallel `response:complete` |
| `onError(id, error, phase)` | Parallel `engine:error` |

## Error Handling

Plugins are error-isolated. If a handler throws:

- The error is caught and logged via `HookLogger`.
- Remaining handlers continue executing.
- The engine never crashes due to a plugin failure.
- In waterfall mode, the previous output passes forward unchanged.

## Example Plugins

### `logger.plugin.ts`
Subscribes to all events at MONITOR priority. Logs timing and metadata
for every hook invocation. Great for debugging execution order.

### `prompt-guard.plugin.ts`
Demonstrates the bail pattern. Blocks inference when the prompt matches
configurable regex deny-patterns (prompt injection). Runs at HIGH priority.

## Contributing

1. Create `plugins/my-plugin.plugin.ts`
2. Implement the `HookPlugin` interface
3. Test with logger enabled to verify hook ordering
4. Submit a merge request with your plugin and tests

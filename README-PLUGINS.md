# Plugin System — LLM Control Engine  
Event‑based hook architecture for extending the LLM Control Engine without modifying core code.

---

# ⚠️ Two Coexisting Plugin Systems

The LLM Control Engine currently supports **two plugin architectures**:

1. **Legacy Hook‑Based Plugin System**  
   - This is the system used by all example plugins in the repository today  
   - This is the system loaded by `PluginLoader`  
   - This is the system used by `prompt-guard.plugin.js`  
   - This system is **stable and fully supported**

2. **Unified Plugin Specification (Experimental)**  
   - A newer, declarative plugin format  
   - Not yet fully integrated into the engine  
   - Not used by example plugins  
   - Intended future direction, but **not ready for production**

Both formats work, but the **legacy hook‑based format is the authoritative one today**.

This README documents **both**, explains when to use each, and provides a **migration guide**.

---

# Quick Start

```ts
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
const prompt = await engine.preProcessPrompt(requestId, userInput);
const gate   = await engine.gateInference(requestId, prompt);
if (!gate.allowed) throw new Error(gate.reason);

// ... run inference ...

const output = await engine.postProcessInference(requestId, result);
const final  = await engine.filterResponse(requestId, output.output);
await engine.complete(requestId, final);
```

---

# 1. Legacy Hook‑Based Plugin Format (CURRENT, FULLY SUPPORTED)

This is the plugin system used by all existing plugins in the repository.

## Structure

```js
export default {
  meta: {
    name: 'my-plugin',
    version: '1.0.0',
    description: 'Does something useful.',
    author: 'Your Name',
  },

  install(tap) {
    tap(
      'prompt:pre-process',
      async (ctx) => {
        // modify ctx.data or bail
        return { data: ctx.data };
      },
      HookPriority.NORMAL
    );
  },
};
```

## Hook Events

Common events include:

| Event | Description |
|-------|-------------|
| `prompt:pre-process` | Before prompt normalization |
| `inference:pre` | Before inference is allowed to run |
| `inference:post` | After inference completes |
| `tool:pre` | Before a tool call |
| `tool:post` | After a tool call |
| `response:filter` | Before final output is returned |

## Hook Return Values

Handlers may return:

- `{}` — no change  
- `{ data }` — modify event payload  
- `{ bail: true, reason }` — stop the pipeline early  

## Hook Priorities

```js
const HookPriority = {
  SYSTEM: 0,
  HIGH: 100,
  NORMAL: 500,
  LOW: 900,
  MONITOR: 1000,
};
```

Higher priority runs earlier.

## Example: Prompt Guard Plugin

```js
const DEFAULT_CONFIG = {
  denyPatterns: [
    /ignore\s+(all\s+)?(previous\s+)?instructions/i,
    /system\s*prompt/i,
    /\bDAN\b/i,
    /do\s+anything\s+now/i,
    /\b(sudo|doas|su)\b/i,
    /chmod\s+.*[0-7]{3,4}/i,
  ],
  blockMessage:
    'Request blocked by prompt-guard: potential security risk detected.',
};

export default {
  meta: {
    name: 'prompt-guard',
    version: '1.0.0',
    description:
      'Blocks prompts matching configurable deny-patterns (bail pattern demo).',
    author: 'LLM Control Engine',
  },

  install(tap) {
    const config = { ...DEFAULT_CONFIG };

    tap(
      'inference:pre',
      async (ctx) => {
        const { prompt } = ctx.data;
        for (const pattern of config.denyPatterns) {
          if (pattern.test(prompt)) {
            return {
              bail: true,
              reason: `${config.blockMessage} (matched: ${pattern.source})`,
            };
          }
        }
        return {};
      },
      HookPriority.HIGH
    );

    tap(
      'prompt:pre-process',
      async (ctx) => {
        return { data: ctx.data };
      },
      HookPriority.HIGH
    );
  },
};
```

---

# 2. Unified Plugin Specification (EXPERIMENTAL)

This is the **new** plugin format described in earlier versions of the README.  
It is **not yet fully wired into the engine**.

## Structure

```js
export default {
  type: 'tool' | 'policy' | 'provider' | 'hook',
  name: 'my-plugin',
  version: 'v1.0.0',
  description: 'Unified plugin example',
  tags: ['example'],

  parameters: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: true },
    },
  },

  run: async (args) => {
    // unified execution entry point
  },
};
```

## Characteristics

- Declarative metadata  
- JSON‑schema parameters  
- Single `run()` entry point  
- Intended to unify tools, policies, providers, and hooks  
- Not yet used by example plugins  
- Not yet fully supported by the loader  

## When to use it

- For experimentation  
- For future‑proof plugin development  
- Not recommended for production yet  

---

# 3. Migration Guide  
### Moving from Legacy Hook‑Based Plugins → Unified Plugin Spec

This guide explains how to convert an existing hook‑based plugin into the new unified format.

---

## Step 1 — Map `meta` → top‑level fields

Legacy:

```js
meta: {
  name: 'prompt-guard',
  version: '1.0.0',
  description: '...',
}
```

Unified:

```js
name: 'prompt-guard',
version: 'v1.0.0',
description: '...',
tags: ['security', 'guardrail'],
```

---

## Step 2 — Replace `install(tap)` with `run()`

Legacy:

```js
install(tap) {
  tap('inference:pre', handler, HookPriority.HIGH);
}
```

Unified:

```js
type: 'policy',
run: async ({ event, data }) => {
  if (event === 'inference:pre') {
    // handler logic
  }
}
```

---

## Step 3 — Convert hook handlers into event switches

Legacy:

```js
tap('prompt:pre-process', async (ctx) => { ... });
```

Unified:

```js
run: async ({ event, data }) => {
  switch (event) {
    case 'prompt:pre-process':
      return { data };
  }
}
```

---

## Step 4 — Convert bail pattern

Legacy:

```js
return { bail: true, reason: 'blocked' };
```

Unified:

```js
return {
  outcome: 'blocked',
  reason: 'blocked',
};
```

---

## Step 5 — Convert configuration to JSON‑schema parameters

Legacy:

```js
const config = { denyPatterns: [...] };
```

Unified:

```js
parameters: {
  type: 'object',
  properties: {
    denyPatterns: {
      type: 'array',
      items: { type: 'string' },
    },
  },
},
```

---

## Step 6 — Update plugin loader (future work)

The current loader only supports legacy plugins.  
Unified plugin support is planned but incomplete.

---

# 4. Recommendations

### If you are writing plugins today  
➡️ Use the **legacy hook‑based format**.

### If you want to experiment with the future  
➡️ Try the unified format, but expect breaking changes.

### If you maintain the repository  
➡️ Keep both documented until the migration is complete.

Just tell me what direction you want next.
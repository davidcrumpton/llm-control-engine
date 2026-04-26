# llmctrlx Plugin Architecture

This document explains how `llmctrlx` loads and executes plugins, what plugin types are supported, and how to build a minimal working plugin.

## What is a plugin?

A plugin is a JavaScript module that exports an object describing a tool, policy, provider, or hook. Plugins are loaded dynamically from one or more directories, then registered in the runtime so the `chat` command can use tools and enforce policy plugins.

## Supported plugin types

`llmctrlx` supports the following plugin types:

- `tool`: A callable utility that the LLM can invoke during a chat session.
- `policy`: A runtime policy that can inspect tool execution attempts and block or allow them.
- `provider`: A custom LLM provider implementation.
- `hook`: A generic extension point for future behavior.

Most plugin authors will start with `tool` and `policy` plugins.

## How plugins are loaded

Plugins are loaded from these locations in order:

1. Built-in plugins shipped with the project
2. Project plugins in `./plugins`
3. A custom tools directory passed via `--tools-dir` or `-T`
4. Global plugins in `~/.llmctrlx/plugins`

The default chat command loads plugins automatically from the built-in plugin folder and any configured project/global plugin directories.

## Minimal plugin structure

A tool plugin is a JavaScript file exporting an object with:

- `type`: `'tool'`
- `name`: unique string identifier
- `description`: human-readable description
- `version`: semantic version string like `v1.0.0`
- `tags`: optional array of strings to filter tools
- `parameters`: JSON-style schema for tool arguments
- `run(args)`: async function that executes the tool

Example shape:

```js
export default {
  type: 'tool',
  name: 'example-tool',
  description: 'A simple example plugin',
  version: 'v1.0.0',
  tags: ['example'],
  parameters: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Name to greet' }
    }
  },
  run: async ({ name }) => {
    return `Hello${name ? `, ${name}` : ''}!`
  }
}
```

## How to use a plugin with `chat`

Load your plugin directory with `--tools-dir`:

```bash
llmctrlx chat -u "Greet the user" -T examples -m gemma4:e2b
```

If your plugin directory includes a tool named `hello-world`, the model may choose it when appropriate. The runtime validates tool arguments, executes the tool, and feeds the result back to the chat.

## Tags and filtering

Tool plugins can include a `tags` array. When `--tags` is passed, only tools with one of the requested tags or the special `always` tag are loaded.

Example:

```bash
llmctrlx chat --tags example -T examples -u "Show me a greeting"
```

## Policy plugins

Policy plugins let you intercept tool execution.

A policy plugin typically exports:

- `type`: `'policy'`
- `name`: unique string
- `onBeforeToolRun({ tool, args, ctx })`: optional async callback

If `onBeforeToolRun` returns an object with `allow: false`, the tool call is blocked and the model is notified.

## Example plugin file

A minimal, useful plugin can live in `examples/hello-world-plugin.js`.

It is a real tool plugin that returns a friendly greeting, the current workspace path, and the current timestamp.

## Notes

- Plugin files are discovered recursively in directories.
- Only `.js`, `.mjs`, and `.cjs` files are considered.
- The plugin loader supports both `run` and legacy aliases like `handler` or `execute`.
- Tool validation checks that `name`, `description`, `version`, `parameters`, and `run()` are present.
- Plugins may implement an optional `init(ctx)` method to receive runtime context.

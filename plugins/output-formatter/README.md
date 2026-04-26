# Output Formatter Plugin

Transforms model output into structured formats such as:

- JSON
- YAML
- Markdown
- Tables
- Minimal text

## Overview

This plugin listens on the `response:filter` hook and formats the final model output based on:

- CLI flags (`--format json`, `--format yaml`, etc.)
- Environment variable `LLMCTRLX_FORMAT`
- Prompt hints such as `format as json`, `format as yaml`, `format as markdown`, `format as table`, or `minimal output`

It uses `./utils.js` to detect the requested format and apply the transformation.

## Supported formats

- `json`
- `yaml` (requires `js-yaml`; falls back to JSON if unavailable)
- `markdown`
- `table`
- `minimal`

## Files

- `output-formatter.plugin.js` — plugin entrypoint
- `utils.js` — format detection and transformation helpers

## Implementation

The plugin uses the stable public plugin API:

```js
import { HookPriority } from 'llmctrlx/plugin-api/hooks';
```

and registers a `response:filter` handler at `HookPriority.NORMAL`.

## Usage

Install the plugin in your plugin directory and ensure the plugin loader can discover it.

If the environment or prompt requests a supported format, the plugin will transform the response before it is returned.

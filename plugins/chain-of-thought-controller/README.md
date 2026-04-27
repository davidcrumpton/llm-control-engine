# Chain-of-Thought Controller Plugin

Controls whether the model uses hidden, visible, suppressed, or structured reasoning.

## Overview

This plugin uses `inference:pre` and `response:filter` hooks to control Chain-of-Thought behavior:

- **Hidden**: Use reasoning internally but hide from final answer
- **Visible**: Show step-by-step reasoning in response  
- **Suppressed**: Answer directly without reasoning
- **Structured**: Use formatted reasoning with clear steps

## Detection

Automatically detects CoT preferences from prompts:

- "show your work" → visible
- "answer directly" → suppressed
- "structured reasoning" → structured
- Default: hidden

## Processing

- `inference:pre`: Adds CoT instructions to prompt
- `response:filter`: Processes response based on mode (hides reasoning for hidden mode, ensures structure for structured mode)

## Files

- `chain-of-thought-controller.plugin.js` — legacy plugin entrypoint
- `chain-of-thought-controller.unified.plugin.js` — unified plugin entrypoint

## Implementation

Uses NORMAL priority for both hooks to allow other plugins to modify before/after.

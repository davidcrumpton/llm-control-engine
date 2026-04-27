# Prompt Sanitizer / Debiaser Plugin

Cleans prompts before they reach the model by removing filler words, fixing grammar, and blocking jailbreak attempts.

## Overview

This plugin listens on the `prompt:pre-process` hook and performs several sanitization operations:

- Blocks prompts matching jailbreak patterns
- Removes filler words (um, uh, like, etc.)
- Normalizes whitespace
- Fixes basic grammar issues
- Expands common shorthand (im → I'm)

## Security Features

Blocks common jailbreak attempts including:
- "ignore all previous instructions"
- "system prompt"
- DAN mode
- "do anything now"
- Developer/unrestricted modes

## Configuration

The unified version allows customization of:
- Jailbreak patterns
- Filler words to remove
- Whether to expand shorthand
- Whether to fix grammar

## Files

- `prompt-sanitizer-debiaser.plugin.js` — legacy plugin entrypoint
- `prompt-sanitizer-debiaser.unified.plugin.js` — unified plugin entrypoint

## Implementation

Uses `prompt:pre-process` hook at HIGH priority to ensure sanitization happens before other processing.
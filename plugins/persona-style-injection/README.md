# Persona / Style Injection Plugin

Automatically rewrites prompts to enforce a persona, tone, or writing style.

## Overview

This plugin listens on the `prompt:pre-process` hook and modifies prompts to include persona instructions based on:

- Built-in personas (senior-sre, noir-detective, minimal-tech)
- Custom persona instructions detected in the prompt
- Plugin parameters for unified version

## Built-in Personas

- `senior-sre`: Respond as a senior SRE explaining calmly at 3 AM
- `noir-detective`: Respond in the voice of a noir detective from a 1940s film noir movie
- `minimal-tech`: Respond in clean, minimal technical English

## Usage

The plugin automatically detects persona requests in prompts:

- "Explain this as a senior SRE"
- "Write in the voice of a noir detective"
- "Respond as a senior SRE explaining calmly"

Or custom instructions:

- "Respond as a pirate"
- "Write in the voice of Shakespeare"

## Files

- `persona-style-injection.plugin.js` — legacy plugin entrypoint
- `persona-style-injection.unified.plugin.js` — unified plugin entrypoint

## Implementation

The plugin uses the stable public plugin API and registers a `prompt:pre-process` handler.
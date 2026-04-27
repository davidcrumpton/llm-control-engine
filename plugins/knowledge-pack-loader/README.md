# Knowledge-Pack Loader Plugin

Injects domain-specific context from knowledge packs into prompts.

## Overview

This plugin listens on the `prompt:pre-process` hook and detects when prompts mention specific technologies or domains, then injects relevant knowledge to provide better context.

## Knowledge Packs

Currently includes packs for:
- **JavaScript**: Core concepts, ES6+ features, popular frameworks
- **Python**: Language features, popular libraries, use cases  
- **Git**: Version control concepts, commands, best practices
- **Docker**: Container concepts, commands, orchestration

## Detection

Detects domains by:
- Direct mentions ("JavaScript", "Python", etc.)
- Related terms ("React" → JavaScript, "pandas" → Python, etc.)

## Usage

When a prompt mentions a supported technology, the plugin prepends relevant knowledge before the user's question, giving the model better context without the user having to provide it.

## Files

- `knowledge-pack-loader.plugin.js` — legacy plugin entrypoint
- `knowledge-pack-loader.unified.plugin.js` — unified plugin entrypoint

## Implementation

Uses `prompt:pre-process` hook at NORMAL priority to enrich prompts with domain knowledge.
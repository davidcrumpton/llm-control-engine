# Tool-Auto-Routing Plugin

Intercepts prompts and decides whether to route to tools, rewrite prompts, or let the LLM handle it.

## Overview

This plugin listens on the `inference:pre` hook and automatically modifies prompts to include tool usage instructions when certain keywords are detected.

## Routing Rules

- **search**: Keywords like "search", "find", "lookup" → routes to web-search tool
- **run-code**: Keywords like "run code", "execute" → routes to code-runner tool  
- **summarize**: Keywords like "summarize this url" → routes to url-fetcher tool

## How it works

When a routing keyword is detected, the plugin prepends a tool usage instruction to the prompt, making it more likely the model will use the appropriate tool.

## Files

- `tool-auto-routing.plugin.js` — legacy plugin entrypoint
- `tool-auto-routing.unified.plugin.js` — unified plugin entrypoint

## Implementation

Uses the `inference:pre` hook at NORMAL priority to modify prompts before inference.
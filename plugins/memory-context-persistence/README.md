# Memory / Context Persistence Plugin

Stores facts from previous interactions and injects them into future prompts.

## Overview

This plugin uses `prompt:pre-process` and `response:filter` hooks to:

1. Extract factual statements from model responses
2. Store them in memory (currently in-memory for demo)
3. Inject relevant context into future prompts in the same conversation

## Features

- Automatic fact extraction from responses
- Relevance-based memory injection
- Configurable limits for facts and memories
- Conversation-scoped memory (per requestId)

## Fact Extraction

The plugin looks for sentences containing:
- "is", "are", "was", "were", "has", "have", "had"
- Words like "fact", "remember", "note"

## Memory Injection

When processing a prompt, the plugin:
- Finds memories with overlapping words (minimum 2 words)
- Injects up to 3 relevant memories as context
- Prepends context to the original prompt

## Files

- `memory-context-persistence.plugin.js` — legacy plugin entrypoint
- `memory-context-persistence.unified.plugin.js` — unified plugin entrypoint

## Implementation

Uses both `response:filter` (LOW priority) to extract facts and `prompt:pre-process` (NORMAL priority) to inject context.
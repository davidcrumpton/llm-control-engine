# Goal-Tracking / Task-Mode Plugin

Tracks goals, keeps responses focused, and summarizes progress.

## Overview

This plugin uses `prompt:pre-process` and `response:filter` hooks to maintain task focus:

- Extracts goals from prompts ("goal: X", "task: Y", etc.)
- Adds goal context to subsequent prompts
- Prevents derailment by checking response relevance
- Adds progress summaries

## Features

- Automatic goal extraction from natural language
- Relevance checking to prevent off-topic responses
- Progress assessment and reporting
- Conversation-scoped goal tracking

## Goal Extraction

Detects goals from patterns like:
- "Goal: implement feature X"
- "Task: fix bug Y"  
- "I want to learn Z"
- "Help me with A"

## Focus Enforcement

Checks if responses are relevant to current goals and refocuses if needed.

## Files

- `goal-tracking-task-mode.plugin.js` — legacy plugin entrypoint
- `goal-tracking-task-mode.unified.plugin.js` — unified plugin entrypoint

## Implementation

Uses NORMAL priority to allow other plugins to process before/after goal tracking.
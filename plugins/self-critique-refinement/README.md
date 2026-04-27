# Self-Critique / Refinement Plugin

After the model generates an answer, critiques and optionally refines the output.

## Overview

This plugin listens on the `inference:post` hook and adds self-critique feedback to responses. In a full implementation, this would call the model again to generate actual critiques.

## Features

- Adds constructive self-critique to responses
- Optional automatic refinement of outputs
- Configurable critique styles (constructive, brief, detailed)
- Simulates Anthropic's constitutional AI approach

## How it works

After inference completes, the plugin:
1. Analyzes the output for common issues
2. Generates a critique comment
3. Optionally applies simple refinements
4. Appends critique to the response

## Files

- `self-critique-refinement.plugin.js` — legacy plugin entrypoint
- `self-critique-refinement.unified.plugin.js` — unified plugin entrypoint

## Implementation

Uses `inference:post` hook to process outputs after generation but before final filtering.
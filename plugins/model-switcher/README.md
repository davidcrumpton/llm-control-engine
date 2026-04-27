# Model-Switcher Plugin

Chooses the best model based on prompt characteristics and task requirements.

## Overview

This plugin listens on the `inference:pre` hook and analyzes prompts to recommend the most suitable model based on content, length, and task type.

## Model Profiles

- **DeepSeek Coder**: Code generation, debugging, technical tasks (low cost)
- **Llama 3.1**: General reasoning, analysis, writing (medium cost)  
- **Mistral**: Conversational, creative, fast responses (low cost)
- **Claude 3**: Complex analysis, long-form content, research (high cost)

## Selection Logic

- **Code keywords** → DeepSeek Coder
- **Analysis + long prompts** → Claude 3
- **Analysis keywords** → Llama 3.1
- **Creative/chat keywords** → Mistral
- **Default** → Llama 3.1

## Features

- Automatic model recommendation based on prompt analysis
- Configurable model profiles and selection rules
- Adds model selection notes to context

## Files

- `model-switcher.plugin.js` — legacy plugin entrypoint
- `model-switcher.unified.plugin.js` — unified plugin entrypoint

## Implementation

Uses `inference:pre` hook at HIGH priority to ensure model selection happens before inference.
#!/usr/bin/env bash
# command-scripts/model+.sh
# Positive tests for the 'model' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== model+ : positive tests ===${NC}"

# 1. List models
assert_succeeds "model: --list" \
    llmctrlx model --list

# 2. List models produces output
assert_output_contains "model: --list returns at least one model" "." \
    llmctrlx model --list

# 3. Show a model that exists (use the configured default)
assert_succeeds "model: --show default model" \
    llmctrlx model --show -m "${LLMCTRLX_MODEL:-gemma4:e4b}"

print_assert_summary

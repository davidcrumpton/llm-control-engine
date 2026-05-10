#!/usr/bin/env bash
# command-scripts/completion+.sh
# Positive tests for the 'completion' command — no LLM calls needed.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== completion+ : positive tests ===${NC}"

assert_output_contains "completion: bash script contains _llmctrlx_completions" "_llmctrlx_completions" \
    llmctrlx completion --shell bash

assert_output_contains "completion: zsh script contains #compdef" "#compdef" \
    llmctrlx completion --shell zsh

assert_output_contains "completion: fish script mentions llmctrlx" "llmctrlx" \
    llmctrlx completion --shell fish

print_assert_summary

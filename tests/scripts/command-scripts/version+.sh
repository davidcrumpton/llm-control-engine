#!/usr/bin/env bash
# command-scripts/version+.sh
# Positive tests for the 'version' command — no LLM calls needed.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== version+ : positive tests ===${NC}"

assert_output_contains "version: prints version string" "llmctrlx v" \
    llmctrlx version

assert_output_contains "version: verbose includes tagline" "orchestration" \
    llmctrlx version -v

assert_output_matches_re "version: verbose includes version number" " v\d+\.\d+\.\d+" \
    llmctrlx version -v

print_assert_summary

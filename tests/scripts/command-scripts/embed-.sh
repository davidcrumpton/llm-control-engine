#!/usr/bin/env bash
# command-scripts/embed-.sh
# Negative tests for the 'embed' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== embed- : negative tests (all should error) ===${NC}"

# 1. No file and no stdin
assert_fails "embed: no -f and no --stdin" \
    llmctrlx embed

# 2. Non-existent file
assert_fails "embed: non-existent file" \
    llmctrlx embed -f "/tmp/no_file_here_xray99.txt"

# 3. Empty stdin
assert_fails "embed: empty stdin" \
    bash -c 'llmctrlx embed --stdin < /dev/null'

print_assert_summary

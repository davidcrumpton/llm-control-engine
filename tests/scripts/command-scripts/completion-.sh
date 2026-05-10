#!/usr/bin/env bash
# command-scripts/completion-.sh
# Negative tests for the 'completion' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== completion- : negative tests ===${NC}"

assert_fails "completion: unknown shell type" \
    llmctrlx completion --shell powershell

assert_fails "completion: unknown shell 'ksh'" \
    llmctrlx completion --shell ksh

print_assert_summary

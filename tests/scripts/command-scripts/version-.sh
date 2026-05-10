#!/usr/bin/env bash
# command-scripts/version-.sh
# Negative tests for 'version' — version takes no arguments that should error.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== version- : negative tests ===${NC}"

# version with unknown flag should error
assert_fails "version: unknown flag --bogus" \
    llmctrlx version --bogus-flag-that-does-not-exist

print_assert_summary

#!/usr/bin/env bash
# command-scripts/plan-.sh
# Negative tests for the 'plan' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== plan- : negative tests ===${NC}"

# Usage: llmctrlx plan <plan-file> [--dry-run] [--record <file>]

# 1. Get a plan with bad file name
assert_fails "plan: bad file name test" \
  llmctrlx plan ./tests/scripts/files/host-health-typo.yaml --dry-run

# 2. Get a plan with bad option name
assert_fails "plan: bad option name test" \
  llmctrlx plan ./tests/scripts/files/host-health.yaml --dry-runnnn

print_assert_summary

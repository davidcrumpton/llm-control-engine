#!/usr/bin/env bash
# command-scripts/plan+.sh
# Positive tests for the 'plan' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== plan+ : positive tests ===${NC}"

# Usage: llmctrlx plan <plan-file> [--dry-run] [--record <file>]

HOST_HEALTH_PLAN_PATH=$(mktemp)

# 1. Get a plan
assert_succeeds "plan: dry-run test" \
  llmctrlx plan ./tests/scripts/files/host-health.yaml --dry-run --record $HOST_HEALTH_PLAN_PATH

# 2. Execute the plan
assert_succeeds "plan: record test" \
  llmctrlx plan ./tests/scripts/files/host-health.yaml --record $HOST_HEALTH_PLAN_PATH

# 3. Remove the recorded plan file
assert_succeeds "plan: cleanup test" \
  rm $HOST_HEALTH_PLAN_PATH

print_assert_summary

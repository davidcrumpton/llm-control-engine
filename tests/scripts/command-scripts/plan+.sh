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

# 4. Test plan variables
assert_succeeds "plan: test variables" \
  llmctrlx plan ./tests/scripts/files/host-health.yaml --var server=atom --var env=dev --dry-run

# 5. Test plan with complex YAML
assert_succeeds "plan: test complex YAML" \
  llmctrlx plan ./tests/scripts/files/network-diag.yaml --dry-run

# 6. Test plan with complex YAML and variables
assert_succeeds "plan: test complex YAML with vars" \
  llmctrlx plan ./tests/scripts/files/network-diag.yaml --var server=atom --var env=prod --dry-run

print_assert_summary

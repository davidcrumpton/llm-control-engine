#!/usr/bin/env bash
# command-scripts/plugins+.sh
# Positive tests for the 'plugins' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== plugins+ : positive tests ===${NC}"

export LLMCTRLX_PLUGINS_DIR="$(echo "$(dirname "${BASH_SOURCE[0]}")/../../../plugins")"

# 1. List plugins (even an empty list should succeed)
assert_succeeds "plugins: --list" \
    llmctrlx plugins --list

# 2. JSON output
assert_succeeds "plugins: --list --json" \
    llmctrlx plugins --list --json

# 1. --show with no plugin name dumps everything
assert_succeeds "plugins: --show with no name" \
    llmctrlx plugins --show

print_assert_summary

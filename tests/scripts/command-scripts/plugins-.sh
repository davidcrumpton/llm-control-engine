#!/usr/bin/env bash
# command-scripts/plugins-.sh
# Negative tests for the 'plugins' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== plugins- : negative tests (all should error) ===${NC}"

export DEFAULT_PLUGINS_DIR="/tmp/"

# 2. --show for a plugin that does not exist
assert_fails "plugins: --show non-existent plugin" \
    llmctrlx plugins --show "plugin_that_does_not_exist_xray99"

print_assert_summary

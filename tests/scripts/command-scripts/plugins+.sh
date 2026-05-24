#!/usr/bin/env bash
# command-scripts/plugins+.sh
# Positive tests for the 'plugins' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== plugins+ : positive tests ===${NC}"

export LLMCTRLX_PLUGINS_DIR="$(echo "$(dirname "${BASH_SOURCE[0]}")/../../../plugins")"

# 1. List plugins (even an empty list should succeed)
# Returns true if none found 

assert_output_matches_re "plugins: --list" "Found [0-9]+ plugin" \
    llmctrlx plugins --list

# 2. JSON output
assert_succeeds "plugins: --list --json" \
    llmctrlx plugins --list --json \| jq -r '.[].name'

# 3. --show with no plugin name dumps everything

assert_output_matches_re "plugins: --show with no name" " logger " \
    llmctrlx plugins --show

unset LLMCTRLX_PLUGINS_DIR

# 2. Test with no plugins directory
assert_succeeds "plugins: no plugins directory" \
    llmctrlx plugins --list

print_assert_summary

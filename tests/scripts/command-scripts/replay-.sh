#!/usr/bin/env bash
# command-scripts/replay-.sh
# Negative tests for the 'replay' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== replay- : negative tests (all should error) ===${NC}"

# 1. No session file
assert_fails "replay: no session file argument" \
    llmctrlx replay

# 2. Non-existent session file
assert_fails "replay: non-existent session file" \
    llmctrlx replay "/tmp/no_such_session_xray99.json"

# 3. Invalid (non-JSON) session file
BADFILE=$(mktemp /tmp/llmctrlx-bad-replay-XXXXXXXX.json)
echo "this is not json { garbage" > "${BADFILE}"
assert_fails "replay: malformed session file" \
    llmctrlx replay "${BADFILE}"
rm -f "${BADFILE}"

print_assert_summary

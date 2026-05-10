#!/usr/bin/env bash
# command-scripts/run+.sh
# Positive tests for the 'run' command (shell command → LLM analysis).

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== run+ : positive tests ===${NC}"

# 1. Basic run
assert_succeeds "run: df -h analysis" \
    llmctrlx run -u "df -h"

# 2. Run with record
RECFILE=$(mktemp /tmp/llmctrlx-run-rec-XXXXXXXX.json)
assert_succeeds "run: record to file" \
    llmctrlx run -u "echo hello_run_test" -R "${RECFILE}"

if [[ -s "${RECFILE}" ]]; then
    echo -e "${GREEN}  ✓ PASS${NC}  run: record file created and non-empty"
    _ASSERT_PASS=$((_ASSERT_PASS + 1))
else
    echo -e "${RED}  ✗ FAIL${NC}  run: record file missing or empty"
    _ASSERT_FAIL=$((_ASSERT_FAIL + 1))
fi

# 3. Replay that record
assert_succeeds "replay: playback recorded run" \
    llmctrlx replay "${RECFILE}"

rm -f "${RECFILE}"

# 4. Run with no-tools
assert_succeeds "run: with --no-tools" \
    llmctrlx run -W -u "ls /tmp"

print_assert_summary

#!/usr/bin/env bash
# command-scripts/run-.sh
# Negative tests for the 'run' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== run- : negative tests (all should error) ===${NC}"

# 1. No -u command
assert_fails "run: missing -u shell command" \
    llmctrlx run

# 2. -W and -T together (mutually exclusive — same as chat)
assert_fails "run: -W and -T are mutually exclusive" \
    llmctrlx run -W -T "/tmp" -u "ls"

# 3. Bad API URL
assert_fails "run: unreachable API URL" \
    llmctrlx run -a "http://127.0.0.1:19999" -u "echo test"

print_assert_summary

#!/usr/bin/env bash
# command-scripts/embed+.sh
# Positive tests for the 'embed' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== embed+ : positive tests ===${NC}"

# 1. Embed a temp file
TMPFILE=$(mktemp /tmp/llmctrlx-embed-XXXXXXXX.txt)
echo "The quick brown fox jumps over the lazy dog." > "${TMPFILE}"

assert_succeeds "embed: single file" \
    llmctrlx embed -f "${TMPFILE}"

# 2. Embed with JSON output
assert_output_contains "embed: --json output contains embedding data" "embedding" \
    llmctrlx embed -f "${TMPFILE}" --json

rm -f "${TMPFILE}"

# 3. Embed from STDIN
assert_succeeds "embed: from stdin" \
    bash -c 'echo "Embedding this text." | llmctrlx embed --stdin'

print_assert_summary

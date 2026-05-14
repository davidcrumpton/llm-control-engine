#!/usr/bin/env bash
# command-scripts/embed-.sh
# Negative tests for the 'embed' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== embed- : negative tests (all should error) ===${NC}"

# 1. No file and no stdin
assert_fails "embed: no -f and no --stdin" \
  llmctrlx embed -m mistral:latest

# 2. Non-existent file
assert_fails "embed: non-existent file" \
  llmctrlx embed -f "/tmp/no_file_here_xray99.txt" -m mistral:latest

# 3. Empty stdin
assert_fails "embed: empty stdin" \
  bash -c 'llmctrlx embed --stdin < /dev/null' -m mistral:latest

# 4. LLMCTRLX_MAX_UPLOAD_FILE_SIZE=x
assert_fails "embed: LLMCTRLX_MAX_UPLOAD_FILE_SIZE=x" \
  bash -c 'LLMCTRLX_MAX_UPLOAD_FILE_SIZE=x llmctrlx embed --stdin < /dev/null' -m mistral:latest

# 5. --no-stream with non-existent file
assert_fails "embed: --no-stream with non-existent file" \
  llmctrlx embed -f /non/existent/file -m mistral:latest --no-stream

# 6. --no-stream with empty stdin
assert_fails "embed: --no-stream with empty stdin" \
  bash -c 'llmctrlx embed --stdin < /dev/null --no-stream' -m mistral:latest


print_assert_summary

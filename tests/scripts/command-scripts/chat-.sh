#!/usr/bin/env bash
# command-scripts/chat-.sh
# Negative tests for the 'chat' command. All commands SHOULD FAIL (exit non-zero).

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

SESSION_BASE="test-chat-neg-$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -c1-8)"

echo -e "\n${CYAN}=== chat- : negative tests (all should error) ===${NC}"

# 1. Missing -u (no prompt at all)
assert_fails "chat: missing -u flag" \
  llmctrlx chat "Say Hello"

# 2. Non-existent model
assert_fails "chat: non-existent model" \
  llmctrlx chat --model "snake_eyes_does_not_exist:latest" -u "Say hello" -k "${SESSION_BASE}_badmodel"

# 3. Wrong model from env var
(
  export LLMCTRLX_MODEL="snake_eyes_does_not_exist"
  assert_fails "chat: wrong model from LLMCTRLX_MODEL env" \
    llmctrlx chat -u "Say hello" -k "${SESSION_BASE}_badenv"
)

# 4. -k with no argument (missing session value)
assert_fails "chat: -k with empty argument" \
  llmctrlx chat -u "Say hello" -k ""

# 5. Empty STDIN (--stdin with no data)
assert_fails "chat: --stdin with empty input" \
  bash -c 'llmctrlx chat --stdin < /dev/null'

# 6. Empty STDIN + streaming
assert_fails "chat: --stdin with empty input and --stream" \
  bash -c 'llmctrlx chat --stdin --stream < /dev/null'

# 7. Non-existent file attachment
assert_fails "chat: non-existent file attachment" \
  llmctrlx chat -u "Summarize this." -f "/tmp/this_file_does_not_exist_xray42.txt" -k "${SESSION_BASE}_badfile"

# 8. -W and -T together (mutually exclusive)
assert_fails "chat: -W and -T are mutually exclusive" \
  llmctrlx chat -W -T "/tmp" -u "Say hello" -k "${SESSION_BASE}_wt"

# 9. Bad provider name
assert_fails "chat: unknown provider" \
  llmctrlx chat -P "unknownprovider99" -u "Say hello" -k "${SESSION_BASE}_badprovider"

# 10. Unreachable API URL
assert_fails "chat: unreachable API URL" \
  llmctrlx chat -h "http://127.0.0.1:19999" -u "Say hello" -k "${SESSION_BASE}_badurl"

# 11. -f flag with no files listed
assert_fails "chat: -f flag with no file argument" \
  bash -c 'llmctrlx chat -u "hello" -f'

# 12. Temperature out of range (if validated)
assert_fails "chat: temperature out of valid range (negative)" \
  llmctrlx chat -t -1 -u "Say hello" -k "${SESSION_BASE}_badtemp" || true
# Note: some providers may silently clamp; this is best-effort

# 13. Streaming via LM Studio
assert_fails "lmstudio chat: streaming" \
  llmctrlx chat -P lmstudio --stream -u "Say 'LMStudio stream OK'" -k "${SESSION_BASE}_stream"

# 7. Empty stdin with chat command (regression test)
assert_fails "chat: empty stdin" \
  bash -c 'llmctrlx chat --stdin < /dev/null' -m mistral:latest

# 8. LLMCTRLX_MAX_UPLOAD_FILE_SIZE=x with chat command (regression test)
assert_fails "chat: LLMCTRLX_MAX_UPLOAD_FILE_SIZE=x" \
  bash -c 'LLMCTRLX_MAX_UPLOAD_FILE_SIZE=x llmctrlx chat' -m mistral:latest

print_assert_summary

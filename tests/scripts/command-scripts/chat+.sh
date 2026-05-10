#!/usr/bin/env bash
# command-scripts/chat+.sh
# Positive tests for the 'chat' command. All should PASS.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

SESSION_BASE="test-chat-$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -c1-8)"

echo -e "\n${CYAN}=== chat+ : positive tests ===${NC}"

# 1. Basic prompt
assert_succeeds "chat: basic -u prompt" \
    llmctrlx chat -u "Reply with the single word: PONG"

# 2. Explicit provider + model
assert_succeeds "chat: explicit --provider ollama and --model" \
    llmctrlx chat --provider ollama -u "Say 'Hello World'" -k "${SESSION_BASE}_explicit"

# 3. Env var model override
(
    export LLMCTRLX_MODEL="${LLMCTRLX_MODEL:-gemma4:e4b}"
    export LLMCTRLX_PROVIDER="ollama"
    assert_succeeds "chat: model from LLMCTRLX_MODEL env var" \
        llmctrlx chat -u "Say 'Hello World'" -k "${SESSION_BASE}_envmodel"
)

# 4. Continued session (history)
assert_succeeds "chat: first turn of session" \
    llmctrlx chat -u "My favourite colour is blue. Remember it." -k "${SESSION_BASE}_hist"
assert_succeeds "chat: second turn continues session" \
    llmctrlx chat -u "What is my favourite colour?" -k "${SESSION_BASE}_hist"

# 5. STDIN prompt
assert_succeeds "chat: stdin prompt" \
    bash -c 'echo "Say: HELLO_FROM_STDIN" | llmctrlx chat --stdin -u "." -k "'"${SESSION_BASE}"'_stdin"'

# 6. Streaming
assert_succeeds "chat: streaming mode" \
    llmctrlx chat -u "Say 'streaming ok'" -k "${SESSION_BASE}_stream" --stream

# 7. STDIN + streaming
assert_succeeds "chat: stdin + streaming" \
    bash -c 'echo "Say: STDIN_STREAM_OK" | llmctrlx chat --stdin --stream -k "'"${SESSION_BASE}"'_stdin_stream"'

# 8. File attachment
TMPFILE=$(mktemp /tmp/llmctrlx-test-XXXXXXXX.txt)
echo "The secret code is: XRAY-42." > "${TMPFILE}"
assert_output_contains "chat: file attachment" "XRAY-42" \
    llmctrlx chat -u "What is the secret code in this file? Output it exactly." -f "${TMPFILE}" -k "${SESSION_BASE}_file"
rm -f "${TMPFILE}"

# 9. System prompt
assert_succeeds "chat: system prompt" \
    llmctrlx chat -s "You are a helpful assistant. Respond briefly." -u "Say OK" -k "${SESSION_BASE}_sys"

# 10. --no-tools flag
assert_succeeds "chat: --no-tools disables tools" \
    llmctrlx chat -W -u "Say 'tools disabled ok'" -k "${SESSION_BASE}_notools"

# 11. Custom history file
HISTFILE=$(mktemp /tmp/llmctrlx-hist-XXXXXXXX.json)
assert_succeeds "chat: custom history file" \
    llmctrlx chat -H "${HISTFILE}" -u "Say 'custom history ok'" -k "${SESSION_BASE}_histfile"
rm -f "${HISTFILE}"

# 12. Session key with context
assert_succeeds "chat: session key isolation" \
    llmctrlx chat -u "Say 'session isolated ok'" -k "${SESSION_BASE}_isolated"

# 13. JSON output mode
assert_output_contains "chat: --json output mode" '"content"' \
    llmctrlx chat --json -u "Say 'json ok'" -k "${SESSION_BASE}_json"

# 14. Temperature parameter
assert_succeeds "chat: temperature flag" \
    llmctrlx chat -t 0.1 -u "Say 'temp ok'" -k "${SESSION_BASE}_temp"

# 15. Record session
RECFILE=$(mktemp /tmp/llmctrlx-rec-XXXXXXXX.json)
assert_succeeds "chat: record session with -R" \
    llmctrlx chat -u "Say 'recording ok'" -R "${RECFILE}" -k "${SESSION_BASE}_rec"
# Verify the record file was created and has content
if [[ -s "${RECFILE}" ]]; then
    echo -e "${GREEN}  ✓ PASS${NC}  chat: record file was created and non-empty"
    _ASSERT_PASS=$((_ASSERT_PASS + 1))
else
    echo -e "${RED}  ✗ FAIL${NC}  chat: record file missing or empty: ${RECFILE}"
    _ASSERT_FAIL=$((_ASSERT_FAIL + 1))
fi
rm -f "${RECFILE}"

print_assert_summary

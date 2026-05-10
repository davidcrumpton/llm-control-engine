#!/usr/bin/env bash
# command-scripts/chat-remote+.sh
# Positive tests for chat using a remote Ollama instance.
# Skipped automatically if the remote server is not reachable.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"
setup_ollama_remote
skip_if_provider_unavailable

SESSION_BASE="test-remote-$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -c1-8)"

echo -e "\n${CYAN}=== chat-remote+ : positive tests (provider: remote ollama @ ${LLMCTRLX_API_URL}) ===${NC}"

# 1. Basic remote chat
assert_succeeds "remote chat: basic prompt" \
    llmctrlx chat -u "Say 'RemoteOllama OK'" -k "${SESSION_BASE}_basic"

# 2. Remote streaming
assert_succeeds "remote chat: streaming" \
    llmctrlx chat --stream -u "Say 'RemoteOllama stream OK'" -k "${SESSION_BASE}_stream"

# 3. Remote model list
assert_succeeds "remote model: --list" \
    llmctrlx model --list

print_assert_summary

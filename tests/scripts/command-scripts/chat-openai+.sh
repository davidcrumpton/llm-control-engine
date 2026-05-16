#!/usr/bin/env bash
# command-scripts/chat-openai+.sh
# Positive tests for chat using OpenAI provider.
# Skipped automatically if OpenAI not running or no __LLMCTRLX_OPENAI_API_KEY set

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"
setup_openai_local
skip_if_provider_unavailable

SESSION_BASE="test-openai-$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -c1-8)"



echo -e "\n${CYAN}=== chat-openai+ : positive tests (provider: openai) ===${NC}"

# 1. Basic chat via OpenAI
assert_succeeds "openai chat: basic prompt" \
  llmctrlx chat -P openai -u "Say 'OpenAI OK'" -k "${SESSION_BASE}_basic" -m o3-mini

# 2. No-tools
assert_succeeds "openai chat: --no-tools" \
  llmctrlx chat -P openai -W -u "Say 'OpenAI notools OK'" -k "${SESSION_BASE}_notools" -m o3-mini

# Test model from env var
export LLMCTRLX_MODEL="gpt-5-mini"

# Ugly output uncomment only if enbled for debugging
# echo -e "- ${YELLOW}LLMCTRLX_MODEL: ${LLMCTRLX_MODEL}${NC}"

# 3. JSON output
assert_output_contains "openai chat: --json output" 'ok' \
  llmctrlx chat -P openai --json -u "Say ok" -k "${SESSION_BASE}_json"

# 4.Provider as ENV var
export LLMCTRLX_PROVIDER="openai"
assert_succeeds "openai chat: --provider env var" \
  llmctrlx chat -u "Say 'OpenAI OK'" -k "${SESSION_BASE}_env"

print_assert_summary

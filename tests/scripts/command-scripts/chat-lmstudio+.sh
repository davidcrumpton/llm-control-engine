#!/usr/bin/env bash
# command-scripts/chat-lmstudio+.sh
# Positive tests for chat using LM Studio provider.
# Skipped automatically if LM Studio is not running locally.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"
setup_lmstudio_local
skip_if_provider_unavailable

SESSION_BASE="test-lms-$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -c1-8)"

echo -e "\n${CYAN}=== chat-lmstudio+ : positive tests (provider: lmstudio) ===${NC}"

# 1. Basic chat via LM Studio
assert_succeeds "lmstudio chat: basic prompt" \
  llmctrlx chat -P lmstudio -u "Say 'LMStudio OK'" -k "${SESSION_BASE}_basic"

# 2. JSON output
assert_output_contains "lmstudio chat: --json output" 'ok' \
  llmctrlx chat -P lmstudio --json -u "Say ok" -k "${SESSION_BASE}_json"

# 3. No-tools
unset LLMCTRLX_TOOLS_DIR
assert_succeeds "lmstudio chat: --no-tools" \
  llmctrlx chat -P lmstudio -W -u "Say 'LMStudio notools OK'" -k "${SESSION_BASE}_notools"

print_assert_summary

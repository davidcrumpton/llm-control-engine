#!/usr/bin/env bash
# command-scripts/chat-lmstudio-.sh
# Negative tests for chat using LM Studio provider.
# Skipped automatically if LM Studio is not running locally.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"
setup_lmstudio_local
skip_if_provider_unavailable

SESSION_BASE="test-lms-$(uuidgen | tr '[:upper:]' '[:lower:]' | cut -c1-8)"

echo -e "\n${CYAN}=== chat-lmstudio- : negative tests (provider: lmstudio) ===${NC}"

# 1. Basic chat via LM Studio
assert_fails "lmstudio chat: basic prompt" \
    llmctrlx chat -P lmstudio -W -u "Say 'LMStudio notools OK'" -k "${SESSION_BASE}_notools"


print_assert_summary

#!/usr/bin/env bash
# command-scripts/model+.sh
# Positive tests for the 'model' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== model+ : positive tests ===${NC}"

# 1. List models
assert_succeeds "model: --list" \
    llmctrlx model --list

# 2. List models produces output
assert_output_contains "model: --list returns at least one model" "." \
    llmctrlx model --list

# The following is the right idea but deletes the default mode
# which breaks the testing scripts
# # 3. --delete with no model name uses default model if none specied
# assert_succeeds "model: --delete with no -m" \
#     llmctrlx model --delete

# 3. --pull with no model name should take the default model for pull
assert_succeeds "model: --pull with no -m" \
    llmctrlx model --pull

print_assert_summary

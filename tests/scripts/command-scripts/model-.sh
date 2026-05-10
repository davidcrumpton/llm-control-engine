#!/usr/bin/env bash
# command-scripts/model-.sh
# Negative tests for the 'model' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== model- : negative tests (all should error) ===${NC}"

# 1. --show with no model name
assert_fails "model: --show with no -m" \
    llmctrlx model --show

# 2. --show for a model that does not exist
assert_fails "model: --show non-existent model" \
    llmctrlx model --show -m "definitely_not_a_real_model_xray99:latest"

# 3. --delete with no model name
assert_fails "model: --delete with no -m" \
    llmctrlx model --delete

# 4. --pull with no model name
assert_fails "model: --pull with no -m" \
    llmctrlx model --pull

# 5. model with no sub-command (should print usage or error)
assert_fails "model: no sub-command given" \
    llmctrlx model

print_assert_summary

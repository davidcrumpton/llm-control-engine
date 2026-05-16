#!/usr/bin/env bash
# command-scripts/replay+.sh
# Positive tests for the 'replay' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== replay+ : positive tests ===${NC}"

# Create a recording to replay
RECFILE=$(mktemp -t llmctrlx-rec-XXXXXXXX.json)

assert_succeeds "replay setup: record a chat session" \
  llmctrlx chat -u "Reply with the single word: REPLAY_TEST" -R "${RECFILE}" -k "replay-test-$(uuidgen | cut -c1-8)"

assert_succeeds "replay: playback recorded session" \
  llmctrlx replay "${RECFILE}"

rm -f "${RECFILE}"

print_assert_summary

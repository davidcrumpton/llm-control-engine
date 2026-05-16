#!/usr/bin/env bash
# command-scripts/embed+.sh
# Positive tests for the 'embed' command.

source "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/funcs.sh"

echo -e "\n${CYAN}=== embed+ : positive tests ===${NC}"

CURENT_MODEL_LIST=$(llmctrlx model --list)
# try small models for testing
EMBEDDABLE_MODELS_PREFERRED=(
mistral:latest
text-embedding-nomic-embed-text-v1.5
text-embedding-3-small
text-embedding-ada-002
)
EMBEDDABLE_MODEL=""
for model in "${EMBEDDABLE_MODELS_PREFERRED[@]}"; do
  if echo "${CURENT_MODEL_LIST}" | grep -q "${model}"; then
    EMBEDDABLE_MODEL="${model}"
    break
  fi
done

echo "Picked embedding model: ${EMBEDDABLE_MODEL}" >&2

if [ -z "${EMBEDDABLE_MODEL}" ]; then
  echo "No embeddable model found" >&2
  exit 1
fi

# 1. Embed a temp file
TMPFILE=$(mktemp -t llmctrlx-embed-XXXXXXXX.txt)
echo "The quick brown fox jumps over the lazy dog." >"${TMPFILE}"

assert_succeeds "embed: single file" \
  llmctrlx embed -f "${TMPFILE}" -m "${EMBEDDABLE_MODEL}"

# 2. Embed with JSON output
assert_output_contains "embed: --json output contains embedding data" "embedding" \
  llmctrlx embed -f "${TMPFILE}" --json -m "${EMBEDDABLE_MODEL}"

rm -f "${TMPFILE}"

# 3. Embed from STDIN
assert_succeeds "embed: from stdin" \
  bash -c "echo \"Embedding this text.\" | llmctrlx embed --stdin -m \"${EMBEDDABLE_MODEL}\""

export LLMCTRLX_MODEL="${EMBEDDABLE_MODEL}"
# 4. Embed multiple files
TMPFILE1=$(mktemp -t llmctrlx-embed-XXXXXXXX.txt)
TMPFILE2=$(mktemp -t llmctrlx-embed-XXXXXXXX.txt)
echo "The quick brown fox jumps over the lazy dog." >"${TMPFILE1}"
echo "The quick brown fox jumps over the lazy dog." >"${TMPFILE2}"
assert_succeeds "embed: multiple files" \
  llmctrlx embed -f "${TMPFILE1}" -f "${TMPFILE2}"

rm -f "${TMPFILE1}" "${TMPFILE2}"

# 5. Embed from STDIN with no newlines
assert_succeeds "embed: from stdin no newlines" \
  bash -c "echo \"Embedding this text without newlines.\" | llmctrlx embed --stdin"

print_assert_summary

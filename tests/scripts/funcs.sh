#!/usr/bin/env bash
# =============================================================================
# funcs.sh — Shared helpers for llmctrlx test suite
# =============================================================================
# Source this file from test scripts. Do not execute directly.
# =============================================================================

SCRIPT_PATH="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
COMMAND_SCRIPTS_PATH="${SCRIPT_PATH}/command-scripts"

# ---- Colors ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

# =============================================================================
# ASSERTION HELPERS
# Each assertion runs a command, checks exit code / output, and reports.
# =============================================================================

_ASSERT_PASS=0
_ASSERT_FAIL=0

# assert_succeeds LABEL CMD [ARGS...]
# Passes when the command exits 0.
assert_succeeds() {
    local label="$1"; shift
    local output exit_code
    output=$("$@" 2>&1)
    exit_code=$?
    if [[ $exit_code -eq 0 ]]; then
        echo -e "${GREEN}  ✓ PASS${NC}  ${label}"
        _ASSERT_PASS=$((_ASSERT_PASS + 1))
    else
        echo -e "${RED}  ✗ FAIL${NC}  ${label}  (exit ${exit_code})"
        echo "       CMD: $*"
        echo "       OUT: ${output}"
        _ASSERT_FAIL=$((_ASSERT_FAIL + 1))
    fi
}

# assert_fails LABEL CMD [ARGS...]
# Passes when the command exits non-zero (error expected).
assert_fails() {
    local label="$1"; shift
    local output exit_code
    output=$("$@" 2>&1)
    exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        echo -e "${GREEN}  ✓ PASS${NC}  ${label}  (correctly errored, exit ${exit_code})"
        _ASSERT_PASS=$((_ASSERT_PASS + 1))
    else
        echo -e "${RED}  ✗ FAIL${NC}  ${label}  (should have failed but exited 0)"
        echo "       CMD: $*"
        echo "       OUT: ${output}"
        _ASSERT_FAIL=$((_ASSERT_FAIL + 1))
    fi
}

# assert_output_contains LABEL PATTERN CMD [ARGS...]
# Passes when stdout/stderr contains PATTERN.
assert_output_contains() {
    local label="$1"; local pattern="$2"; shift 2
    local output
    output=$("$@" 2>&1)
    if echo "${output}" | grep -q "${pattern}"; then
        echo -e "${GREEN}  ✓ PASS${NC}  ${label}"
        _ASSERT_PASS=$((_ASSERT_PASS + 1))
    else
        echo -e "${RED}  ✗ FAIL${NC}  ${label}  (pattern '${pattern}' not found)"
        echo "       CMD: $*"
        echo "       OUT: ${output}"
        _ASSERT_FAIL=$((_ASSERT_FAIL + 1))
    fi
}

# assert_exit_code LABEL EXPECTED CMD [ARGS...]
assert_exit_code() {
    local label="$1"; local expected="$2"; shift 2
    local output exit_code
    output=$("$@" 2>&1)
    exit_code=$?
    if [[ $exit_code -eq $expected ]]; then
        echo -e "${GREEN}  ✓ PASS${NC}  ${label}  (exit ${exit_code})"
        _ASSERT_PASS=$((_ASSERT_PASS + 1))
    else
        echo -e "${RED}  ✗ FAIL${NC}  ${label}  (expected exit ${expected}, got ${exit_code})"
        echo "       CMD: $*"
        echo "       OUT: ${output}"
        _ASSERT_FAIL=$((_ASSERT_FAIL + 1))
    fi
}

# print_assert_summary — call at end of each test script
print_assert_summary() {
    local total=$((_ASSERT_PASS + _ASSERT_FAIL))
    echo ""
    echo -e "${BOLD}  Script summary: ${_ASSERT_PASS}/${total} passed${NC}"
    if [[ $_ASSERT_FAIL -gt 0 ]]; then
        echo -e "${RED}  ${_ASSERT_FAIL} assertion(s) failed${NC}"
        return 1
    fi
}

# =============================================================================
# PROVIDER ENVIRONMENT SETUP
# =============================================================================

# Local Ollama (default)
setup_ollama_local() {
    export LLMCTRLX_PROVIDER="ollama"
    export LLMCTRLX_API_URL="http://127.0.0.1:11434"
    export LLMCTRLX_MODEL="${LLMCTRLX_MODEL:-gemma4:e4b}"
}

# Remote Ollama
setup_ollama_remote() {
    export LLMCTRLX_PROVIDER="ollama"
    export LLMCTRLX_API_URL="${LLMCTRLX_REMOTE_API_URL:-http://192.168.1.125:11434}"
    export LLMCTRLX_MODEL="${LLMCTRLX_REMOTE_MODEL:-mistral:latest}"
    export __LLMCTRLX_OLLAMA_API_KEY="${LLMCTRLX_REMOTE_API_KEY:-}"
}

# LM Studio (local only)
setup_lmstudio_local() {
    export LLMCTRLX_PROVIDER="lmstudio"
    export LLMCTRLX_API_URL="http://127.0.0.1:1234/v1"
    export LLMCTRLX_MODEL="${LLMCTRLX_LMSTUDIO_MODEL:-gemma-4-e2b}"
}

# =============================================================================
# PROVIDER AVAILABILITY CHECK
# =============================================================================

provider_available() {
    local url="${LLMCTRLX_API_URL:-http://127.0.0.1:11434}"
    local provider="${LLMCTRLX_PROVIDER:-ollama}"

    case "${provider}" in
        ollama)
            curl -sf --max-time 3 "${url}/api/tags" > /dev/null 2>&1
            ;;
        lmstudio)
            curl -sf --max-time 3 "${url}/models" > /dev/null 2>&1
            ;;
        *)
            curl -sf --max-time 3 "${url}" > /dev/null 2>&1
            ;;
    esac
}

# skip_if_provider_unavailable — use at top of remote/lmstudio test scripts
skip_if_provider_unavailable() {
    if ! provider_available; then
        echo -e "${YELLOW}  ⊘ SKIP${NC}  Provider '${LLMCTRLX_PROVIDER}' at '${LLMCTRLX_API_URL}' is not reachable — skipping script"
        exit 0
    fi
}

# =============================================================================
# LLMCTRLX COMMAND WRAPPERS
# =============================================================================

llmctrlx_chat()    { llmctrlx chat    "$@"; }
llmctrlx_model()   { llmctrlx model   "$@"; }
llmctrlx_embed()   { llmctrlx embed   "$@"; }
llmctrlx_bench()   { llmctrlx bench   "$@"; }
llmctrlx_run()     { llmctrlx run     "$@"; }
llmctrlx_plan()    { llmctrlx plan    "$@"; }
llmctrlx_replay()  { llmctrlx replay  "$@"; }
llmctrlx_tools()   { llmctrlx tools   "$@"; }
llmctrlx_history() { llmctrlx history "$@"; }
llmctrlx_plugins() { llmctrlx plugins "$@"; }
llmctrlx_version() { llmctrlx version "$@"; }

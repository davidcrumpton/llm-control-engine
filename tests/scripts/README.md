# llmctrlx test suite

## What's new

### `llmtest` — the new central runner

```bash
# Run all tests for all providers
./llmtest --type all --provider any

# Quick focused tests
./llmtest --type positive              # only passing-expected tests
./llmtest --type negative              # only failure-expected tests
./llmtest --command chat               # chat+ and chat- only
./llmtest --command chat --type positive
./llmtest --provider lmstudio          # auto-skips if LMStudio not running
./llmtest --provider remote            # auto-skips if remote Ollama unreachable
./llmtest --command "version completion"  # multiple commands
./llmtest --dry-run                    # see what would run without executing
./llmtest --stop                       # bail on first failure

```

Results are timestamped and logged to `tests/scripts/results/llmtest-YYYYMMDD-HHMMSS.log` automatically, so you can check them in the morning.

### `funcs.sh` — big upgrade

Three new things it provides:

**Assertion helpers** — every test now uses `assert_succeeds`, `assert_fails`, `assert_output_contains`, or `assert_exit_code`. Each prints a clear ✓/✗ line and counts pass/fail. `print_assert_summary` at the end of each script gives a per-script tally and exits non-zero if anything failed, so `llmtest` can detect it.

**Provider setup functions** — `setup_ollama_local`, `setup_ollama_remote`, `setup_lmstudio_local` properly set the right env vars for each target.

**`skip_if_provider_unavailable`** — provider-specific scripts call this at the top. If LMStudio isn't running or the remote server is down, the script exits 0 with a clear SKIP message instead of failing the whole suite.

### Provider-specific test scripts

`chat-lmstudio+.sh` and `chat-remote+.sh` are new. They call `setup_*` and `skip_if_provider_unavailable` at the top, so they're safe to include in `run-all.sh` — they'll just auto-skip when those providers aren't up.

### Negative tests are actually asserted now

The old `chat-.sh` just ran commands and relied on `set -x` output to spot failures visually. The new ones use `assert_fails` — so each case is individually verified to produce a non-zero exit, and the summary tells you exactly which negative scenarios unexpectedly passed (which would be real bugs).

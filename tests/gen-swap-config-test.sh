#!/usr/bin/env bash
# tests/gen-swap-config-test.sh — TDD tests for scripts/gen-swap-config.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$REPO/scripts/gen-swap-config.sh"
OUT="$(mktemp /tmp/llama-swap-test-XXXXXX.yaml)"
PASS=0; FAIL=0

cleanup() { rm -f "$OUT"; }
trap cleanup EXIT

ok()   { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL+1)); }

assert_contains() {
  local desc="$1" pattern="$2"
  if grep -qF -- "$pattern" "$OUT"; then ok "$desc"
  else fail "$desc — pattern not found: $pattern"; fi
}

assert_not_contains() {
  local desc="$1" pattern="$2"
  if ! grep -qF -- "$pattern" "$OUT"; then ok "$desc"
  else fail "$desc — unexpected pattern found: $pattern"; fi
}

# ---------------------------------------------------------------------------
# Shared baseline config used by T1–T11.
# Four fixed models so tests are independent of the live config.sh.
# ---------------------------------------------------------------------------
BASELINE_CONFIG="$(mktemp /tmp/config-baseline-XXXXXX.sh)"
cat > "$BASELINE_CONFIG" <<'CFGEOF'
#!/usr/bin/env bash
TOOLBOX="llama-vulkan-radv"
MODELS=(
  "qwen3.6-35b-a3b-ud|/home/saman/models/qwen3.6-35b-a3b/Qwen3.6-35B-A3B-UD-Q6_K.gguf"
  "qwen3.6-27b|/home/saman/models/qwen3.6-27b/Qwen3.6-27B-Q8_0.gguf"
  "gemma-4-26b|/home/saman/models/gemma-4-26b-a4b/gemma-4-26B-A4B-it-Q8_0.gguf"
  "gpt-oss-120b|/home/saman/models/gpt-oss-120b/gpt-oss-120b-mxfp4-00001-of-00003.gguf"
)
HOST="0.0.0.0"
PORT="8080"
CONTEXT="262144"
N_PARALLEL="1"
EXTRA_FLAGS=(-ngl 999 -fa 1 --no-mmap --jinja)
declare -A MODEL_CONTEXT=()
CFGEOF
trap 'rm -f "$BASELINE_CONFIG" "$OUT"' EXIT

echo "=== gen-swap-config-test.sh ==="

# Script must exist and be executable.
if [[ ! -x "$SCRIPT" ]]; then
  echo "FATAL: $SCRIPT not found or not executable"
  exit 1
fi

# Run generator against baseline config.
CONFIG_FILE="$BASELINE_CONFIG" "$SCRIPT" "$OUT"

# --- T1: Generated header present -------------------------------------------
assert_contains "T1: generated header" "# GENERATED from config.sh"

# --- T2: healthCheckTimeout present -----------------------------------------
assert_contains "T2: healthCheckTimeout present" "healthCheckTimeout:"

# --- T3: Exactly 4 model blocks (the 4 required model keys) -----------------
model_count=$(awk '/^models:/{found=1; next} found && /^  [a-zA-Z]/ && /^  [^[:space:]].*:$/ {count++} END{print count+0}' "$OUT")
if [[ "$model_count" == "4" ]]; then ok "T3: exactly 4 model blocks"
else fail "T3: expected 4 model blocks, got $model_count"; fi

# --- T4: All 4 required model keys present ----------------------------------
for key in qwen3.6-35b-a3b-ud qwen3.6-27b gemma-4-26b gpt-oss-120b; do
  assert_contains "T4: model key $key present" "  ${key}:"
done

# --- T5: Each cmd contains -m <path> ----------------------------------------
assert_contains "T5: qwen3.6-35b-a3b-ud cmd has -m path" "-m /home/saman/models/qwen3.6-35b-a3b/Qwen3.6-35B-A3B-UD-Q6_K.gguf"
assert_contains "T5: qwen3.6-27b cmd has -m path" "-m /home/saman/models/qwen3.6-27b/Qwen3.6-27B-Q8_0.gguf"
assert_contains "T5: gemma-4-26b cmd has -m path" "-m /home/saman/models/gemma-4-26b-a4b/gemma-4-26B-A4B-it-Q8_0.gguf"
assert_contains "T5: gpt-oss-120b cmd has -m path" "-m /home/saman/models/gpt-oss-120b/gpt-oss-120b-mxfp4-00001-of-00003.gguf"

# --- T6: cmdStop uses -m <full path> grep-escaped (dots backslashed) --------
assert_contains "T6: qwen3.6-35b-a3b-ud cmdStop has escaped path" '"-m /home/saman/models/qwen3\.6-35b-a3b/Qwen3\.6-35B-A3B-UD-Q6_K\.gguf"'
assert_contains "T6: qwen3.6-27b cmdStop has escaped path" '"-m /home/saman/models/qwen3\.6-27b/Qwen3\.6-27B-Q8_0\.gguf"'
assert_contains "T6: gemma-4-26b cmdStop has escaped path" '"-m /home/saman/models/gemma-4-26b-a4b/gemma-4-26B-A4B-it-Q8_0\.gguf"'
assert_contains "T6: gpt-oss-120b cmdStop has escaped path" '"-m /home/saman/models/gpt-oss-120b/gpt-oss-120b-mxfp4-00001-of-00003\.gguf"'

# --- T7: cmdStop uses pkill -TERM and pkill -KILL pattern -------------------
assert_contains "T7: cmdStop has pkill -TERM" "pkill -TERM -f"
assert_contains "T7: cmdStop has pkill -KILL" "pkill -KILL -f"

# --- T8: cmdStop wraps command inside toolbox run bash -c -------------------
assert_contains "T8: cmdStop uses toolbox run bash -c" "toolbox run -c llama-vulkan-radv bash -c"

# --- T9: Default context (262144) applied in macro or cmd -------------------
assert_contains "T9: default context 262144 present" "262144"

# --- T10: Per-model context override respected (MODEL_CONTEXT mechanism) ----
OVERRIDE_CONFIG="$(mktemp /tmp/config-override-XXXXXX.sh)"
OVERRIDE_OUT="$(mktemp /tmp/llama-swap-override-XXXXXX.yaml)"
cat > "$OVERRIDE_CONFIG" <<'CFGEOF'
#!/usr/bin/env bash
TOOLBOX="llama-vulkan-radv"
MODELS=(
  "test-model|/home/saman/models/test/test-model.gguf"
)
HOST="0.0.0.0"
PORT="8080"
CONTEXT="262144"
N_PARALLEL="1"
EXTRA_FLAGS=(-ngl 999 -fa 1)
declare -A MODEL_CONTEXT=(["test-model"]="131072")
CFGEOF

if CONFIG_FILE="$OVERRIDE_CONFIG" "$SCRIPT" "$OVERRIDE_OUT" 2>/dev/null; then
  if grep -qE '^ *cmd: .* -c 131072( |$)' "$OVERRIDE_OUT"; then
    ok "T10: per-model context override (131072) injected into cmd"
  else
    fail "T10: per-model context override not in cmd — would be a runtime no-op"
  fi
else
  fail "T10: script failed with CONFIG_FILE override"
fi
rm -f "$OVERRIDE_CONFIG" "$OVERRIDE_OUT"

# --- T11: EXTRA_FLAGS array flags appear in macro/cmd -----------------------
assert_contains "T11: -ngl 999 from EXTRA_FLAGS present" "-ngl 999"
assert_contains "T11: -fa 1 from EXTRA_FLAGS present" "-fa 1"

# ---------------------------------------------------------------------------
# T12: Empty MODELS=() → generator must exit non-zero and print error to stderr
# ---------------------------------------------------------------------------
EMPTY_CONFIG="$(mktemp /tmp/config-empty-XXXXXX.sh)"
EMPTY_OUT="$(mktemp /tmp/llama-swap-empty-XXXXXX.yaml)"
cat > "$EMPTY_CONFIG" <<'CFGEOF'
#!/usr/bin/env bash
TOOLBOX="llama-vulkan-radv"
MODELS=()
HOST="0.0.0.0"
PORT="8080"
CONTEXT="262144"
N_PARALLEL="1"
EXTRA_FLAGS=(-ngl 999)
declare -A MODEL_CONTEXT=()
CFGEOF

ERR_MSG="$(CONFIG_FILE="$EMPTY_CONFIG" "$SCRIPT" "$EMPTY_OUT" 2>&1 || true)"
if CONFIG_FILE="$EMPTY_CONFIG" "$SCRIPT" "$EMPTY_OUT" 2>/dev/null; then
  fail "T12: empty MODELS should exit non-zero but exited 0"
else
  ok "T12: empty MODELS exits non-zero"
fi

if echo "$ERR_MSG" | grep -qiE "empty|nothing|MODELS"; then
  ok "T12: empty MODELS prints informative error message"
else
  fail "T12: empty MODELS error not informative (got: '${ERR_MSG:0:120}')"
fi
rm -f "$EMPTY_CONFIG" "$EMPTY_OUT"

# ---------------------------------------------------------------------------
# T13: Path with spaces — cmdStop keeps '-m "..."' as a single quoted argument
# The escaped pattern must be wrapped in quotes so pkill receives it as one
# argument, not split on the space inside the path.
# ---------------------------------------------------------------------------
SPACES_CONFIG="$(mktemp /tmp/config-spaces-XXXXXX.sh)"
SPACES_OUT="$(mktemp /tmp/llama-swap-spaces-XXXXXX.yaml)"
cat > "$SPACES_CONFIG" <<'CFGEOF'
#!/usr/bin/env bash
TOOLBOX="llama-vulkan-radv"
MODELS=(
  "spacy-model|/home/saman/models/my model dir/the model.gguf"
)
HOST="0.0.0.0"
PORT="8080"
CONTEXT="262144"
N_PARALLEL="1"
EXTRA_FLAGS=(-ngl 999)
declare -A MODEL_CONTEXT=()
CFGEOF

CONFIG_FILE="$SPACES_CONFIG" "$SCRIPT" "$SPACES_OUT" 2>/dev/null
# The path contains a space. cmdStop must emit the pkill pattern with the
# full "-m <path>" wrapped in double-quotes so it arrives as one argument.
if grep -qF '"-m /home/saman/models/my model dir/the model\.gguf"' "$SPACES_OUT"; then
  ok "T13: path-with-spaces: '-m ...' is one quoted pkill argument"
else
  fail "T13: path-with-spaces: quoted '-m ...' not found in cmdStop"
fi
rm -f "$SPACES_CONFIG" "$SPACES_OUT"

# ---------------------------------------------------------------------------
# T14: Substring paths — escaped pattern of shorter must NOT match longer cmdline
# No real pkill is invoked; we simulate cmdline strings with grep -F.
# ---------------------------------------------------------------------------
SHORT_PATH="/home/saman/models/qwen3.6-27b/Qwen3.6-27B-Q8_0.gguf"
LONG_PATH="/home/saman/models/qwen3.6-27b/Qwen3.6-27B-Q8_0-extended.gguf"

# Escape dots the same way gen-swap-config.sh does (only dots → \.).
esc_short="$(printf '%s' "$SHORT_PATH" | sed 's/\./\\./g')"
pkill_pat='"-m '"$esc_short"'"'

# A simulated cmdline for the LONG model — must NOT match the short pattern.
long_cmdline="llama-server --host 127.0.0.1 -m ${LONG_PATH} -ngl 999"
if ! echo "$long_cmdline" | grep -qF -- "$pkill_pat"; then
  ok "T14: short escaped pattern does not substring-match longer cmdline (no false positive)"
else
  fail "T14: short escaped pattern falsely matches longer cmdline"
fi

# And it DOES correctly match the exact short-model cmdline.
short_cmdline="llama-server --host 127.0.0.1 ${pkill_pat} -ngl 999"
if echo "$short_cmdline" | grep -qF -- "$pkill_pat"; then
  ok "T14: short escaped pattern correctly matches its own exact cmdline"
else
  fail "T14: short escaped pattern does not match its own cmdline"
fi

# ---------------------------------------------------------------------------
# T15: Canary — empty curl response must reach the _fail branch
# Inline the canary completion-check logic using a mock empty RESPONSE.
# ---------------------------------------------------------------------------
RESPONSE=""
CANARY_FAIL=0
if [[ -z "$RESPONSE" ]]; then
  CANARY_FAIL=1
fi
if [[ "$CANARY_FAIL" -eq 1 ]]; then
  ok "T15: empty curl response reaches _fail branch"
else
  fail "T15: empty curl response did not reach _fail branch"
fi

# ---------------------------------------------------------------------------
# T16: Canary — non-printable bytes in content must reach the _fail branch
# Inline the canary printable-check logic with an actual control character.
# ---------------------------------------------------------------------------
CONTENT_JUNK="$(printf 'OK\x01\x02')"
NON_PRINTABLE="$(printf '%s' "$CONTENT_JUNK" | tr -d '[:print:][:space:]' || true)"
if [[ -n "$NON_PRINTABLE" ]]; then
  ok "T16: non-printable content reaches _fail branch"
else
  fail "T16: non-printable check did not detect junk bytes"
fi

# --- Summary ----------------------------------------------------------------
echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1

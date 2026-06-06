#!/usr/bin/env bash
# tests/gen-swap-config-test.sh — TDD tests for scripts/gen-swap-config.sh
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCRIPT="$REPO/scripts/gen-swap-config.sh"
OUT="$(mktemp /tmp/llama-swap-test-XXXXXX.yaml)"
PASS=0; FAIL=0

cleanup() { rm -f "$OUT"; }
trap cleanup EXIT

ok() { echo "  PASS: $1"; PASS=$((PASS+1)); }
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
echo "=== gen-swap-config-test.sh ==="

# Script must exist
if [[ ! -x "$SCRIPT" ]]; then
  echo "FATAL: $SCRIPT not found or not executable"
  exit 1
fi

# Run generator to temp file
"$SCRIPT" "$OUT"

# --- T1: Generated header present -------------------------------------------
assert_contains "T1: generated header" "# GENERATED from config.sh"

# --- T2: healthCheckTimeout present -----------------------------------------
assert_contains "T2: healthCheckTimeout present" "healthCheckTimeout:"

# --- T3: Exactly 4 model blocks (the 4 required model keys) -----------------
count=$(grep -c '^  [a-zA-Z].*:$' "$OUT" || true)
# Count model keys under 'models:' section specifically
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
# The cmdStop must contain the path with dots escaped as \. for use in pgrep/pkill -f
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
# Create a temp config.sh override to test MODEL_CONTEXT
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
  if grep -qF "131072" "$OVERRIDE_OUT"; then
    ok "T10: per-model context override (131072) respected"
  else
    fail "T10: per-model context override not applied — 131072 not in output"
  fi
else
  fail "T10: script failed with CONFIG_FILE override"
fi
rm -f "$OVERRIDE_CONFIG" "$OVERRIDE_OUT"

# --- T11: EXTRA_FLAGS array flags appear in macro/cmd -----------------------
assert_contains "T11: -ngl 999 from EXTRA_FLAGS present" "-ngl 999"
assert_contains "T11: -fa 1 from EXTRA_FLAGS present" "-fa 1"

# --- Summary ----------------------------------------------------------------
echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ "$FAIL" -eq 0 ]] && exit 0 || exit 1

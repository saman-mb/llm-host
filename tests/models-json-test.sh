#!/usr/bin/env bash
# tests/models-json-test.sh — TDD tests for scripts/models.sh JSON output
# Run: bash tests/models-json-test.sh
# Tests pass once models.sh emits valid, well-structured JSON via jq -n --arg.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODELS_SH="$REPO/scripts/models.sh"

PASS=0
FAIL=0

ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

# ---------------------------------------------------------------------------
# T1: bash -n syntax check
# ---------------------------------------------------------------------------
if bash -n "$MODELS_SH" 2>/dev/null; then
  ok "T1: models.sh passes bash -n syntax check"
else
  fail "T1: models.sh fails bash -n syntax check"
fi

# ---------------------------------------------------------------------------
# T2: output is valid JSON parseable by jq
# ---------------------------------------------------------------------------
OUTPUT="$("$MODELS_SH" 2>/dev/null || true)"
if echo "$OUTPUT" | jq . >/dev/null 2>&1; then
  ok "T2: models.sh output is valid JSON"
else
  fail "T2: models.sh output is not valid JSON (got: ${OUTPUT:0:120})"
fi

# ---------------------------------------------------------------------------
# T3: output has .active field (string)
# ---------------------------------------------------------------------------
ACTIVE="$(echo "$OUTPUT" | jq -r '.active // empty' 2>/dev/null || true)"
if [[ -n "$ACTIVE" ]]; then
  ok "T3: .active field present and non-empty ('$ACTIVE')"
else
  fail "T3: .active field missing or empty"
fi

# ---------------------------------------------------------------------------
# T4: output has .models array
# ---------------------------------------------------------------------------
MODELS_TYPE="$(echo "$OUTPUT" | jq -r 'if .models | type == "array" then "array" else "not-array" end' 2>/dev/null || true)"
if [[ "$MODELS_TYPE" == "array" ]]; then
  ok "T4: .models is an array"
else
  fail "T4: .models is not an array (type: $MODELS_TYPE)"
fi

# ---------------------------------------------------------------------------
# T5: each model entry has key, file, exists fields
# ---------------------------------------------------------------------------
MODELS_COUNT="$(echo "$OUTPUT" | jq '.models | length' 2>/dev/null || echo 0)"
if [[ "$MODELS_COUNT" -gt 0 ]]; then
  INVALID="$(echo "$OUTPUT" | jq '[.models[] | select((.key|type)!="string" or (.file|type)!="string" or (.exists|type)!="boolean")] | length' 2>/dev/null || echo 1)"
  if [[ "$INVALID" -eq 0 ]]; then
    ok "T5: all $MODELS_COUNT model entries have key (string), file (string), exists (boolean)"
  else
    fail "T5: $INVALID model entries missing required fields"
  fi
else
  fail "T5: .models array is empty — expected at least one entry from config.sh"
fi

# ---------------------------------------------------------------------------
# T6: script uses jq -n --arg (not printf-based JSON construction)
# ---------------------------------------------------------------------------
if grep -qE 'jq\s+-n' "$MODELS_SH" && grep -qE '\-\-arg|\-\-argjson|\-\-args' "$MODELS_SH"; then
  ok "T6: models.sh uses jq -n --arg for JSON emission"
else
  fail "T6: models.sh does not use jq -n --arg (required by spec)"
fi

# ---------------------------------------------------------------------------
# T7: .active matches one of the model keys in .models
# ---------------------------------------------------------------------------
MATCH="$(echo "$OUTPUT" | jq -r '.active as $a | .models | map(select(.key==$a)) | length' 2>/dev/null || echo 0)"
if [[ "$MATCH" -gt 0 ]]; then
  ok "T7: .active value '$ACTIVE' matches a key in .models"
else
  fail "T7: .active value '$ACTIVE' does not match any key in .models"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]

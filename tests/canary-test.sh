#!/usr/bin/env bash
# tests/canary-test.sh — TDD tests for scripts/canary.sh
# Run: bash tests/canary-test.sh
# Tests pass once canary.sh is fully implemented.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CANARY="$REPO/scripts/canary.sh"

PASS=0
FAIL=0

ok()   { echo "PASS: $1"; PASS=$((PASS+1)); }
fail() { echo "FAIL: $1"; FAIL=$((FAIL+1)); }

# ---------------------------------------------------------------------------
# T1: bash -n syntax check
# ---------------------------------------------------------------------------
if bash -n "$CANARY" 2>/dev/null; then
  ok "T1: canary.sh passes bash -n syntax check"
else
  fail "T1: canary.sh fails bash -n syntax check"
fi

# ---------------------------------------------------------------------------
# T2: curl invocation uses temperature 0
# ---------------------------------------------------------------------------
if grep -qE '"temperature"\s*:\s*0' "$CANARY"; then
  ok "T2: curl payload contains temperature:0"
else
  fail "T2: curl payload missing temperature:0"
fi

# ---------------------------------------------------------------------------
# T3: curl invocation uses small max_tokens (<=20)
# ---------------------------------------------------------------------------
MAX_TOKENS_VAL=$(grep -oE '"max_tokens"\s*:\s*[0-9]+' "$CANARY" | grep -oE '[0-9]+$' | head -1 || true)
if [[ -n "$MAX_TOKENS_VAL" && "$MAX_TOKENS_VAL" -le 20 ]]; then
  ok "T3: max_tokens is small (<=20), got $MAX_TOKENS_VAL"
else
  fail "T3: max_tokens missing or too large (got '${MAX_TOKENS_VAL:-<none>}')"
fi

# ---------------------------------------------------------------------------
# T4: non-empty + printable content check is present
# ---------------------------------------------------------------------------
# Canary must check that the response .choices[0].message.content is non-empty
# AND contains only printable characters (not garbled/binary output).
# Both conditions must be present: an emptiness guard and a printable guard.
CHOICES_CHECK=0
grep -qE 'choices\[0\]' "$CANARY" && CHOICES_CHECK=1
EMPTY_CHECK=0
grep -qE '\-z\s+"\$\{?CONTENT|length\s*==\s*0|\[:print:\]' "$CANARY" && EMPTY_CHECK=1
PRINT_CHECK=0
grep -qE '\[:print:\]|tr -d|NON_PRINTABLE' "$CANARY" && PRINT_CHECK=1
if [[ "$CHOICES_CHECK" -eq 1 && "$EMPTY_CHECK" -eq 1 && "$PRINT_CHECK" -eq 1 ]]; then
  ok "T4: non-empty + printable content check present"
else
  fail "T4: non-empty/printable content check missing (choices=$CHOICES_CHECK empty=$EMPTY_CHECK printable=$PRINT_CHECK)"
fi

# ---------------------------------------------------------------------------
# T5: error logging on failure
# ---------------------------------------------------------------------------
if grep -qE 'logger|journalctl|systemd-cat|>&2|log' "$CANARY"; then
  ok "T5: error logging present"
else
  fail "T5: no error logging found"
fi

# ---------------------------------------------------------------------------
# T6: desktop notify on failure
# ---------------------------------------------------------------------------
if grep -qE 'notify-send|gdbus|dbus-send' "$CANARY"; then
  ok "T6: desktop notification on failure present"
else
  fail "T6: no desktop notification found"
fi

# ---------------------------------------------------------------------------
# T7: GTT orphan check — reads mem_info_gtt_used
# ---------------------------------------------------------------------------
if grep -qE 'mem_info_gtt_used' "$CANARY"; then
  ok "T7: GTT mem_info_gtt_used read is present"
else
  fail "T7: GTT mem_info_gtt_used read missing"
fi

# ---------------------------------------------------------------------------
# T8: GTT orphan check — reads /running count
# ---------------------------------------------------------------------------
if grep -qE '/running' "$CANARY"; then
  ok "T8: /running endpoint check present"
else
  fail "T8: /running endpoint check missing"
fi

# ---------------------------------------------------------------------------
# T9: GTT orphan threshold is 5 GiB — must use the exact byte constant 5368709120
# (5*1024^3). Pattern \b5G\b dropped: too broad, matches unrelated strings.
# ---------------------------------------------------------------------------
if grep -qE '5368709120|5\s*\*\s*1024\s*\*\s*1024\s*\*\s*1024' "$CANARY"; then
  ok "T9: GTT orphan threshold 5 GiB present (exact byte value)"
else
  fail "T9: GTT orphan threshold 5368709120 not found in canary.sh"
fi

# ---------------------------------------------------------------------------
# T10: GTT orphan triggers log + notify
# ---------------------------------------------------------------------------
# The GTT orphan path (>5G GTT, /running empty) must also log and notify.
GTT_LINE=$(grep -n 'mem_info_gtt_used' "$CANARY" | head -1 | cut -d: -f1 || true)
if [[ -n "$GTT_LINE" ]]; then
  # Check there's a notify-send or logger within 20 lines of the GTT check
  START=$((GTT_LINE > 5 ? GTT_LINE - 2 : 1))
  END=$((GTT_LINE + 25))
  if sed -n "${START},${END}p" "$CANARY" | grep -qE 'notify-send|_notify|logger|systemd-cat|_log'; then
    ok "T10: GTT orphan path has log/notify action"
  else
    fail "T10: GTT orphan path missing log/notify action near line $GTT_LINE"
  fi
else
  fail "T10: Cannot locate GTT check block"
fi

# ---------------------------------------------------------------------------
# T11: canary_validate function is defined and sourceable
# ---------------------------------------------------------------------------
if grep -qE '^canary_validate\(\)' "$CANARY"; then
  ok "T11: canary_validate() function defined in canary.sh"
else
  fail "T11: canary_validate() function not found in canary.sh"
fi

# ---------------------------------------------------------------------------
# T12: source guard prevents main body from running when sourced
# ---------------------------------------------------------------------------
if grep -qE 'BASH_SOURCE\[0\].*!=.*\$0|BASH_SOURCE.*!=.*0' "$CANARY"; then
  ok "T12: source guard (BASH_SOURCE[0] != \$0) present"
else
  fail "T12: source guard missing — sourcing canary.sh would run main body"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
echo ""
echo "Results: $PASS passed, $FAIL failed"
[[ $FAIL -eq 0 ]]

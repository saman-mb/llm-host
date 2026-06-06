#!/usr/bin/env bash
# TDD repo-checks: all assertions must pass for exit 0.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PASS=0
FAIL=0

ok()   { echo "  PASS: $*"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $*"; FAIL=$((FAIL + 1)); }

echo "=== repo-checks ==="

# (a) No file in scripts/, web/server/, gnome-extension/, systemd/ references
#     llama-server.service or keepwarm — those belong only in MODELS.md / memory / docs.
echo
echo "--- (a) stale service name references ---"

FORBIDDEN_DIRS="$REPO/scripts $REPO/web/server $REPO/gnome-extension $REPO/systemd"
FORBIDDEN_PATTERNS="llama-server\.service|llm-host-keepwarm"

hits=$(grep -rE "$FORBIDDEN_PATTERNS" $FORBIDDEN_DIRS 2>/dev/null \
       | grep -v "^Binary" || true)

if [ -z "$hits" ]; then
  ok "no llama-server.service / keepwarm refs in scripts,web/server,gnome-extension,systemd"
else
  echo "$hits"
  fail "found forbidden service-name references:"
  echo "$hits" | sed 's/^/    /'
fi

# (b) checkLlamaStatus in web/server/index.js uses the LLAMA_SERVICE constant.
#     We verify: (1) LLAMA_SERVICE constant is declared, (2) the status call uses \${LLAMA_SERVICE}.
echo
echo "--- (b) checkLlamaStatus uses LLAMA_SERVICE constant ---"

IDX="$REPO/web/server/index.js"

if grep -q "const LLAMA_SERVICE" "$IDX"; then
  ok "LLAMA_SERVICE constant declared in index.js"
else
  fail "LLAMA_SERVICE constant missing in index.js"
fi

if grep -q '\${LLAMA_SERVICE}' "$IDX"; then
  ok "checkLlamaStatus references \${LLAMA_SERVICE}"
else
  fail "checkLlamaStatus does not reference \${LLAMA_SERVICE} — still using hard-coded string"
fi

# (c) status.sh survives bash -n and contains '|| true' after is-active.
echo
echo "--- (c) status.sh syntax + || true guard ---"

STATUS="$REPO/scripts/status.sh"

if bash -n "$STATUS" 2>/dev/null; then
  ok "status.sh passes bash -n (syntax OK)"
else
  fail "status.sh has syntax errors"
fi

if grep -q "|| true" "$STATUS"; then
  ok "status.sh contains '|| true'"
else
  fail "status.sh missing '|| true' after is-active"
fi

# (d) Positive assert: canary service, control service, and timer unit files
#     reference only systemd unit names that actually exist in systemd/ or are
#     the known third-party unit llama-swap.service.
echo
echo "--- (d) systemd unit cross-references are valid ---"

SYSTEMD_DIR="$REPO/systemd"

# Collect all unit files that exist in the repo.
mapfile -t EXISTING_UNITS < <(ls "$SYSTEMD_DIR"/*.service "$SYSTEMD_DIR"/*.timer 2>/dev/null | xargs -I{} basename {} || true)
# llama-swap.service is managed externally (installed from package/llama-swap binary).
EXISTING_UNITS+=("llama-swap.service")

# Build a lookup set.
declare -A UNIT_SET=()
for u in "${EXISTING_UNITS[@]}"; do
  UNIT_SET["$u"]=1
done

# Unit files that reference other units (Wants=, After=, Unit=, etc.)
CHECK_UNITS=(
  "$SYSTEMD_DIR/llm-host-canary.service"
  "$SYSTEMD_DIR/llm-host-canary.timer"
  "$SYSTEMD_DIR/llm-host-control.service"
)

for unit_file in "${CHECK_UNITS[@]}"; do
  [[ -f "$unit_file" ]] || continue
  unit_name="$(basename "$unit_file")"
  # Extract all referenced unit names from Wants=, After=, Requires=, Unit= directives.
  refs="$(grep -oE '(Wants|After|Requires|Unit)\s*=\s*\S+' "$unit_file" \
          | grep -oE '[^ =]+\.(service|timer)' || true)"
  bad_refs=()
  while IFS= read -r ref; do
    [[ -z "$ref" ]] && continue
    if [[ -z "${UNIT_SET[$ref]:-}" ]]; then
      bad_refs+=("$ref")
    fi
  done <<< "$refs"

  if [[ "${#bad_refs[@]}" -eq 0 ]]; then
    ok "$unit_name: all referenced units exist in systemd/ or are known (llama-swap)"
  else
    fail "$unit_name: references non-existent units: ${bad_refs[*]}"
  fi
done

# Summary
echo
echo "=== Results: $PASS passed, $FAIL failed ==="
[ "$FAIL" -eq 0 ]

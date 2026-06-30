#!/usr/bin/env bash
# tests/ui-spec-test.sh
# Validate DEFAULT_UI_SPEC in control-server/index.js.
# Runs without a live server — extracts the spec via Node.js directly.
# Also validates the GNOME extension passes node --check.
# Usage: bash tests/ui-spec-test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_JS="$ROOT/control-server/index.js"
EXT_JS="$ROOT/gnome-extension/llm-host@local/extension.js"
export SERVER_JS EXT_JS

PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

# ---------------------------------------------------------------------------
# Write Node helper scripts to temp files — avoids bash quoting nightmares
# ---------------------------------------------------------------------------
TMPDIR_LOCAL="$(mktemp -d)"
trap 'rm -rf "$TMPDIR_LOCAL"' EXIT

# Helper: extract DEFAULT_UI_SPEC and print JSON
cat > "$TMPDIR_LOCAL/extract-spec.cjs" <<'EOF'
const fs = require('fs');
const src = fs.readFileSync(process.env.SERVER_JS, 'utf-8');
const start = src.indexOf('const DEFAULT_UI_SPEC');
if (start === -1) { process.stderr.write('DEFAULT_UI_SPEC not found\n'); process.exit(1); }
let depth = 0, inSpec = false, end = start;
for (let i = start; i < src.length; i++) {
  if (src[i] === '{') { depth++; inSpec = true; }
  if (src[i] === '}') { depth--; }
  if (inSpec && depth === 0) { end = i + 1; break; }
}
const snippet = src.slice(start, end) + ';';
const fn = new Function(snippet + '; return DEFAULT_UI_SPEC;');
const spec = fn();
process.stdout.write(JSON.stringify(spec));
EOF

# Helper: strip GJS imports and node --check the extension
cat > "$TMPDIR_LOCAL/check-ext.cjs" <<'EOF'
const fs = require('fs');
const cp = require('child_process');
const os = require('os');
const path = require('path');
const src = fs.readFileSync(process.env.EXT_JS, 'utf-8');
const stripped = src
  .replace(/^import .+ from 'gi:\/\/.+$/gm, '// gi-import')
  .replace(/^import .+ from 'resource:\/\/.+$/gm, '// resource-import');
const tmp = path.join(os.tmpdir(), '_ext_check_' + Date.now() + '.mjs');
fs.writeFileSync(tmp, stripped);
try {
  cp.execSync('node --check ' + tmp, { stdio: 'pipe' });
  process.stdout.write('ok');
} catch (e) {
  const msg = e.stderr ? e.stderr.toString().trim() : e.message;
  process.stdout.write('fail: ' + msg.split('\n')[0]);
} finally {
  try { fs.unlinkSync(tmp); } catch {}
}
EOF

extract_spec() {
    node "$TMPDIR_LOCAL/extract-spec.cjs" 2>/dev/null
}

echo "=== ui-spec-test.sh ==="
echo ""

# ---------------------------------------------------------------------------
# Suite 1: Syntax checks
# ---------------------------------------------------------------------------
echo "-- Suite 1: Syntax --"

if node --check "$SERVER_JS" 2>/dev/null; then
    pass "node --check control-server/index.js"
else
    fail "node --check control-server/index.js"
fi

EXT_CHECK=$(node "$TMPDIR_LOCAL/check-ext.cjs" 2>/dev/null)
if [ "$EXT_CHECK" = "ok" ]; then
    pass "node --check gnome-extension/llm-host@local/extension.js (GJS imports stripped)"
else
    fail "node --check extension.js: $EXT_CHECK"
fi

echo ""

# ---------------------------------------------------------------------------
# Suite 2: DEFAULT_UI_SPEC structure
# ---------------------------------------------------------------------------
echo "-- Suite 2: Spec structure --"

SPEC=$(extract_spec 2>/dev/null) || SPEC=""

if [ -n "$SPEC" ]; then
    pass "DEFAULT_UI_SPEC extracted from index.js"
else
    fail "DEFAULT_UI_SPEC extracted from index.js"
    echo "  Cannot continue without spec — aborting."
    exit 1
fi

if echo "$SPEC" | grep -q '"unit"'; then pass "spec.unit present"; else fail "spec.unit present"; fi
if echo "$SPEC" | grep -q '"poll"'; then pass "spec.poll present"; else fail "spec.poll present"; fi
if echo "$SPEC" | grep -q '"items"'; then pass "spec.items present"; else fail "spec.items present"; fi

# Check poll value via a tiny inline node one-liner
POLL=$(echo "$SPEC" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(String(JSON.parse(d).poll));}catch{process.stdout.write('err');}});" 2>/dev/null)
if [ "$POLL" = "10" ]; then pass "spec.poll == 10"; else fail "spec.poll == 10 (got '$POLL')"; fi

UNIT=$(echo "$SPEC" | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>{try{process.stdout.write(JSON.parse(d).unit||'');}catch{process.stdout.write('');}});" 2>/dev/null)
if echo "$UNIT" | grep -q "llama-swap"; then pass "spec.unit is llama-swap"; else fail "spec.unit not llama-swap (got '$UNIT')"; fi

echo ""

# ---------------------------------------------------------------------------
# Suite 3: Required menu items present
# ---------------------------------------------------------------------------
echo "-- Suite 3: Required menu items --"

check_label() {
    local label="$1"
    if echo "$SPEC" | grep -q "\"$label\""; then
        pass "label '$label' present"
    else
        fail "label '$label' present"
    fi
}

check_type() {
    local type="$1"
    if echo "$SPEC" | grep -q "\"type\":\"$type\""; then
        pass "type '$type' present"
    else
        fail "type '$type' present"
    fi
}

check_type "status"
check_type "toggle"
check_type "separator"
check_type "submenu"
check_label "Launch chat ↗"
check_label "Tail journal"

# ComfyUI toggle exists
if echo "$SPEC" | grep -q '"Start ComfyUI"'; then pass "ComfyUI start toggle present"; else fail "ComfyUI start toggle present"; fi
if echo "$SPEC" | grep -q '"Stop ComfyUI"'; then pass "ComfyUI stop toggle present"; else fail "ComfyUI stop toggle present"; fi

# ComfyUI toggle has unit field
if echo "$SPEC" | grep -q '"unit":"comfyui.service"'; then pass "ComfyUI toggle has unit field"; else fail "ComfyUI toggle has unit field"; fi

# Count toggles (should be 2: LLM, ComfyUI — Embeddings is status-only)
TOGGLE_COUNT=$(echo "$SPEC" | grep -o '"type":"toggle"' | wc -l)
if [ "$TOGGLE_COUNT" -eq 2 ]; then pass "2 toggle items in spec"; else fail "Expected 2 toggles, got $TOGGLE_COUNT"; fi

# ComfyUI submenu has Free VRAM and Open
if echo "$SPEC" | grep -q '"Free VRAM"'; then pass "Free VRAM in ComfyUI submenu"; else fail "Free VRAM in ComfyUI submenu"; fi

# ComfyUI submenu has Open ComfyUI
if echo "$SPEC" | grep -q '"Open ComfyUI ↗"'; then pass "Open ComfyUI in ComfyUI submenu"; else fail "Open ComfyUI in ComfyUI submenu"; fi

# Embeddings has dynamic:embeds
if echo "$SPEC" | grep -q '"dynamic":"embeds"'; then pass "dynamic:embeds present"; else fail "dynamic:embeds present"; fi

# Models has dynamic:models
if echo "$SPEC" | grep -q '"dynamic":"models"'; then pass "dynamic:models present"; else fail "dynamic:models present"; fi

# Status items are service-scoped
if echo "$SPEC" | grep -q '"LLM: checking…"'; then pass "LLM status label present"; else fail "LLM status label present"; fi
if echo "$SPEC" | grep -q '"ComfyUI: checking…"'; then pass "ComfyUI status label present"; else fail "ComfyUI status label present"; fi
if echo "$SPEC" | grep -q '"Embeddings: checking…"'; then pass "Embeddings status label present"; else fail "Embeddings status label present"; fi

# Old labels removed (not in new spec)
if echo "$SPEC" | grep -q '"Restart"'; then fail "Restart removed from top level"; else pass "Restart removed from top level"; fi
if echo "$SPEC" | grep -q '"Scripts"'; then fail "Scripts removed from top level"; else pass "Scripts removed from top level"; fi
if echo "$SPEC" | grep -q '"Switch model"'; then fail "Switch model removed (replaced by Models submenu)"; else pass "Switch model removed (replaced by Models submenu)"; fi
if echo "$SPEC" | grep -q '"Free ComfyUI VRAM"'; then fail "Free ComfyUI VRAM moved to submenu (old label gone)"; else pass "Free ComfyUI VRAM moved to submenu (old label gone)"; fi

# ComfyUI free endpoint bound
if echo "$SPEC" | grep -q '\["POST","/api/comfyui/free"'; then
    pass "'Free VRAM' action targets POST /api/comfyui/free"
else
    fail "'Free VRAM' action targets POST /api/comfyui/free"
fi

if echo "$SPEC" | grep -q "8188"; then pass "ComfyUI URL (8188) present"; else fail "ComfyUI URL (8188) present"; fi
if echo "$SPEC" | grep -q "8080"; then pass "chat URL (8080) present"; else fail "chat URL (8080) present"; fi
# Web control dashboard removed — GNOME menu is the only control surface now.
if echo "$SPEC" | grep -q "8081"; then fail "web control URL (8081) should be gone"; else pass "web control URL (8081) removed"; fi

echo ""

# ---------------------------------------------------------------------------
# Suite 4: Extension thin-shell hygiene
# ---------------------------------------------------------------------------
echo "-- Suite 4: Extension hygiene --"

if grep -q "/api/ui" "$EXT_JS"; then
    pass "extension.js fetches /api/ui"
else
    fail "extension.js fetches /api/ui"
fi

if grep -q "hashString\|_specHash" "$EXT_JS"; then
    pass "extension.js hashes spec to gate rebuilds"
else
    fail "extension.js hashes spec to gate rebuilds"
fi

if grep -qE "^const WEB_URL|^const COMFYUI_URL|^const SERVER_URL" "$EXT_JS"; then
    fail "extension.js has hardcoded top-level URL constants (should come from spec)"
else
    pass "extension.js has no hardcoded top-level URL constants"
fi

# Count llama-server string refs — grep -c returns 1 when no match so use grep with || true
LLAMA_REFS=$(grep -c "llama-server" "$EXT_JS" 2>/dev/null || true)
if [ "$LLAMA_REFS" -le 3 ]; then
    pass "extension.js has ≤3 hardcoded 'llama-server' refs (fallback defaults only)"
else
    fail "extension.js has $LLAMA_REFS hardcoded 'llama-server' refs (expected ≤3)"
fi

if grep -q "function buildItems" "$EXT_JS"; then
    pass "extension.js has generic buildItems renderer"
else
    fail "extension.js has generic buildItems renderer"
fi

for kind in systemctl script url http; do
    if grep -q "case '$kind'" "$EXT_JS"; then
        pass "dispatchAction handles '$kind'"
    else
        fail "dispatchAction handles '$kind'"
    fi
done

echo ""

# ---------------------------------------------------------------------------
# Suite 5: Action kinds present in spec
# ---------------------------------------------------------------------------
echo "-- Suite 5: Action kinds in spec --"

for kind in systemctl script url http; do
    if echo "$SPEC" | grep -q "\"kind\":\"$kind\""; then
        pass "action kind '$kind' used in spec"
    else
        fail "action kind '$kind' used in spec"
    fi
done

echo ""

# ---------------------------------------------------------------------------
# Suite 6: Live server check (optional — skipped if not running)
# ---------------------------------------------------------------------------
echo "-- Suite 6: Live server (optional) --"

LIVE=$(curl -s --max-time 3 "http://127.0.0.1:3001/api/ui" 2>/dev/null || true)
if echo "$LIVE" | grep -q '"unit"' && echo "$LIVE" | grep -q '"items"'; then
    pass "GET /api/ui returns valid spec JSON with 'unit' and 'items'"
elif echo "$LIVE" | grep -q "<!doctype\|<!DOCTYPE\|<html"; then
    echo "  SKIP: /api/ui returns HTML — server is running old code (needs restart to pick up new route)"
elif curl -s --max-time 2 "http://127.0.0.1:3001/api/health" >/dev/null 2>&1; then
    fail "GET /api/ui did not return expected spec JSON"
else
    echo "  SKIP: control server not running on :3001 — skipping live checks"
fi

echo ""

# ---------------------------------------------------------------------------
# Suite 7: Behavioral state logic (pure functions)
# ---------------------------------------------------------------------------
echo "-- Suite 7: State logic (label-state-test.mjs) --"

LABEL_TEST="$(dirname "$0")/label-state-test.mjs"
if [ -f "$LABEL_TEST" ]; then
    if node "$LABEL_TEST" >/dev/null 2>&1; then
        LABEL_COUNT=$(node "$LABEL_TEST" 2>&1 | grep -c "PASS:" || true)
        pass "label-state-test.mjs: $LABEL_COUNT assertions passed"
    else
        LABEL_COUNT=$(node "$LABEL_TEST" 2>&1 | grep -c "PASS:" || true)
        LABEL_FAIL=$(node "$LABEL_TEST" 2>&1 | grep -c "FAIL:" || true)
        fail "label-state-test.mjs: $LABEL_FAIL of $((LABEL_COUNT + LABEL_FAIL)) failed"
    fi
else
    echo "  SKIP: $LABEL_TEST not found"
fi

# Static checks: extracted helpers exist in extension.js
if grep -q "function collectUnits" "$EXT_JS"; then
    pass "extension.js exports collectUnits helper"
else
    fail "extension.js exports collectUnits helper"
fi

if grep -q "function computeToggleLabel" "$EXT_JS"; then
    pass "extension.js exports computeToggleLabel helper"
else
    fail "extension.js exports computeToggleLabel helper"
fi

# Verify no remaining sync I/O (_seedUnitStates removed)
if grep -q "_seedUnitStates" "$EXT_JS"; then
    fail "extension.js still has _seedUnitStates (should be removed)"
else
    pass "extension.js has no _seedUnitStates (sync I/O removed)"
fi

# Verify _refreshComfyUI removed (routed through _applyUnitState)
if grep -q "_refreshComfyUI" "$EXT_JS"; then
    fail "extension.js still has _refreshComfyUI (should be removed)"
else
    pass "extension.js has no _refreshComfyUI (routed through _applyUnitState)"
fi

# Verify ComfyUI status update in _applyUnitState
if grep -q "comfyui.service.*_comfyuiStatusItem\|_comfyuiStatusItem.*comfyui.service" "$EXT_JS"; then
    pass "extension.js updates ComfyUI status in _applyUnitState"
else
    fail "extension.js updates ComfyUI status in _applyUnitState"
fi

# Verify embed status uses control server
if grep -q "CONTROL_URL.*api/embeddings\|api/embeddings" "$EXT_JS"; then
    pass "extension.js embed status uses control server /api/embeddings"
else
    fail "extension.js embed status uses control server /api/embeddings"
fi

# Verify no direct localhost:8080 references for embed status
if grep -q "localhost:8080/running" "$EXT_JS"; then
    fail "extension.js still hits localhost:8080 directly (should use control server)"
else
    pass "extension.js has no direct localhost:8080 references"
fi

echo ""

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
TOTAL=$((PASS + FAIL))
echo "=== Results: $PASS/$TOTAL passed ==="
if [ "$FAIL" -gt 0 ]; then
    echo "FAILED: $FAIL test(s) did not pass."
    exit 1
else
    echo "All tests passed."
    exit 0
fi

#!/usr/bin/env bash
# tests/ui-spec-test.sh
# Validate DEFAULT_UI_SPEC in web/server/index.js.
# Runs without a live server — extracts the spec via Node.js directly.
# Also validates the GNOME extension passes node --check.
# Usage: bash tests/ui-spec-test.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SERVER_JS="$ROOT/web/server/index.js"
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
    pass "node --check web/server/index.js"
else
    fail "node --check web/server/index.js"
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
check_type "model"
check_type "toggle"
check_type "separator"
check_type "submenu"
check_label "Restart"
check_label "Scripts"
check_label "Switch model"
check_label "Embeddings"
check_label "Free ComfyUI VRAM"
check_label "Tail journal"

# Bind the "Free ComfyUI VRAM" item to its action target so a typo'd path or
# wrong method can't slip past the label-only check above.
if echo "$SPEC" | grep -q '\["POST","/api/comfyui/free"'; then
    pass "'Free ComfyUI VRAM' action targets POST /api/comfyui/free"
else
    fail "'Free ComfyUI VRAM' action targets POST /api/comfyui/free"
fi

if echo "$SPEC" | grep -q "sync-opencode-models.sh"; then
    pass "sync-opencode-models.sh present in spec"
else
    fail "sync-opencode-models.sh present in spec"
fi

if echo "$SPEC" | grep -q "8188"; then pass "ComfyUI URL (8188) present"; else fail "ComfyUI URL (8188) present"; fi
if echo "$SPEC" | grep -q "8080"; then pass "chat URL (8080) present"; else fail "chat URL (8080) present"; fi
# Web control dashboard removed — GNOME menu is the only control surface now.
if echo "$SPEC" | grep -q "8081"; then fail "web control URL (8081) should be gone"; else pass "web control URL (8081) removed"; fi

if echo "$SPEC" | grep -q '"dynamic":"models"'; then pass "dynamic:models submenu present"; else fail "dynamic:models submenu present"; fi
if echo "$SPEC" | grep -q '"dynamic":"embeds"'; then pass "dynamic:embeds submenu present"; else fail "dynamic:embeds submenu present"; fi

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

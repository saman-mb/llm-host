#!/usr/bin/env bash
# sync-model.sh — propagate the active local model id into every downstream
# consumer config so they all point at whatever llama-server is actually serving.
#
# The taskbar GNOME extension and the web control UI auto-detect the model from
# /v1/models, but Hermes and OpenCode each PIN the model id in their config and
# must be updated by hand whenever you swap models. This script does that.
#
# Source of truth for the model id (in priority order):
#   1. an explicit argument (a model id or a path to a .gguf)
#   2. the running llama-server's GET /v1/models   (what's truly loaded)
#   3. MODEL_PATH in config.sh                      (fallback when server is down)
#
# Usage:
#   scripts/sync-model.sh                 # auto-detect from the live server / config.sh
#   scripts/sync-model.sh <id-or-path>    # set explicitly
#
# Safe & idempotent: only touches a file when the value actually changes, and
# backs it up (<file>.bak-<timestamp>) before writing. Prints what it changed.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=/dev/null
source "$REPO_ROOT/config.sh"
PORT="${PORT:-8080}"

# --- Resolve the target model id ---------------------------------------------
NEW_ID=""
if [ "${1:-}" != "" ]; then
    NEW_ID="$(basename "$1")"            # accept a bare id or a /path/to/model.gguf
else
    NEW_ID="$(curl -s --max-time 3 "http://localhost:${PORT}/v1/models" 2>/dev/null \
        | python3 -c 'import sys,json
try:
    d=json.load(sys.stdin); a=d.get("data") or d.get("models") or []
    print((a[0].get("id") or a[0].get("name") or "") if a else "")
except Exception:
    print("")' 2>/dev/null || true)"
    if [ -z "$NEW_ID" ] && [ -n "${MODEL_PATH:-}" ]; then
        NEW_ID="$(basename "$MODEL_PATH")"
        echo "(server unreachable — using MODEL_PATH from config.sh)"
    fi
fi

if [ -z "$NEW_ID" ]; then
    echo "error: could not determine the model id." >&2
    echo "       Start llama-server, or pass it explicitly: scripts/sync-model.sh <id|path>" >&2
    exit 1
fi

echo "==> Target model id: $NEW_ID"
export NEW_ID

# --- Update the consumer configs (Hermes + OpenCode) -------------------------
HERMES_CFG="$HOME/.hermes/config.yaml" \
OPENCODE_CFG="$HOME/.config/opencode/opencode.json" \
python3 - <<'PY'
import json, os, re, shutil, time

new = os.environ["NEW_ID"]
ts  = time.strftime("%Y%m%d-%H%M%S")
changed_any = False

def backup(path):
    dst = f"{path}.bak-{ts}"
    shutil.copy2(path, dst)
    return dst

# --- Hermes: ~/.hermes/config.yaml -------------------------------------------
# Targeted text replace (preserves comments/formatting): swap the current
# model.default value everywhere it appears (covers custom_providers too, which
# in practice share the same id).
hermes = os.environ["HERMES_CFG"]
if os.path.isfile(hermes):
    try:
        import yaml
        raw = open(hermes).read()
        cfg = yaml.safe_load(raw) or {}
        old = (cfg.get("model") or {}).get("default")
        if not old:
            print("   hermes:   no model.default found — skipped")
        elif old == new:
            print(f"   hermes:   already {new}")
        else:
            new_raw = raw.replace(old, new)
            if new_raw != raw:
                backup(hermes)
                open(hermes, "w").write(new_raw)
                print(f"   hermes:   {old} -> {new}")
                changed_any = True
            else:
                print(f"   hermes:   already {new}")
    except Exception as e:
        print(f"   hermes:   ERROR ({e}) — left unchanged")
else:
    print("   hermes:   ~/.hermes/config.yaml not found — skipped")

# --- OpenCode: ~/.config/opencode/opencode.json ------------------------------
# The local provider lists models by a slug key; the served model is whatever
# llama-server has loaded, so we keep a single entry matching the new id.
oc = os.environ["OPENCODE_CFG"]
if os.path.isfile(oc):
    try:
        cfg  = json.load(open(oc))
        prov = (cfg.get("provider") or {}).get("local")
        if not prov:
            print("   opencode: no 'local' provider — skipped")
        else:
            existing = prov.get("models") or {}
            # Already configured for this model? Match by display name (== id),
            # so a tidy hand-picked slug is preserved across runs.
            match_key = next((k for k, v in existing.items()
                              if isinstance(v, dict) and v.get("name") == new), None)
            if match_key:
                desired_default = f"local/{match_key}"
                if cfg.get("model") == desired_default:
                    print(f"   opencode: already local/{match_key}")
                else:
                    backup(oc)
                    cfg["model"] = desired_default
                    with open(oc, "w") as f:
                        json.dump(cfg, f, indent=2); f.write("\n")
                    print(f"   opencode: default -> local/{match_key}")
                    changed_any = True
            else:
                slug = re.sub(r"[^a-z0-9]+", "-", new.lower().removesuffix(".gguf")).strip("-")
                limit = next((v["limit"] for v in existing.values()
                              if isinstance(v, dict) and v.get("limit")), None) \
                        or {"context": 262144, "output": 65536}
                backup(oc)
                prov["models"] = {slug: {"name": new, "limit": limit}}
                cfg["model"]   = f"local/{slug}"
                with open(oc, "w") as f:
                    json.dump(cfg, f, indent=2); f.write("\n")
                print(f"   opencode: model -> local/{slug}")
                changed_any = True
    except Exception as e:
        print(f"   opencode: ERROR ({e}) — left unchanged")
else:
    print("   opencode: ~/.config/opencode/opencode.json not found — skipped")

print("==> Done." + ("" if changed_any else " Nothing to change."))
PY

echo
echo "No restart needed — Hermes and OpenCode read their config each session."
echo "Verify:  hermes -z 'hi'   |   opencode run 'hi'"

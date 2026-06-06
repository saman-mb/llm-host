#!/usr/bin/env bash
# Sync local llama-server models into ~/.config/opencode/opencode.json
# Reads the model registry from config.sh, queries the running server for
# context-window metadata, and writes the opencode provider config.
#
# Usage: scripts/sync-opencode-models.sh [--dry-run]
#
# W5: model data (file paths, keys, active model) is passed to Python via
# environment variables or argv — never interpolated into heredocs or -c strings.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO/config.sh"

OPENCODE_CONFIG="$HOME/.config/opencode/opencode.json"
DRY_RUN=false

if [ "${1:-}" = "--dry-run" ]; then
    DRY_RUN=true
fi

if [ ! -f "$OPENCODE_CONFIG" ]; then
    echo "error: opencode config not found at $OPENCODE_CONFIG" >&2
    exit 1
fi

# Detect the running server's model via its /v1/models endpoint.
SERVER_MODELS_JSON=""
if command -v curl &>/dev/null; then
    SERVER_MODELS_JSON="$(curl -sf "http://127.0.0.1:${PORT}/v1/models" 2>/dev/null || true)"
fi

# Build a tab-delimited list of "key\tfile\tcontext\toutput" entries.
# Each field is passed to Python via environment variable LLM_MODEL_LIST,
# never injected into the Python source text.
MODEL_LIST=""
for entry in "${MODELS[@]}"; do
    key="${entry%%|*}"
    path="${entry#*|}"
    file="${path##*/}"

    # Resolve context window for this model from server metadata.
    ctx=131072
    if [ -n "$SERVER_MODELS_JSON" ]; then
        ctx="$(printf '%s' "$SERVER_MODELS_JSON" | \
            LLM_TARGET_FILE="$file" python3 -c '
import sys, json, os
target = os.environ["LLM_TARGET_FILE"]
data = json.load(sys.stdin)
for m in data.get("data", data.get("models", [])):
    meta = m.get("meta", {})
    name = m.get("id", m.get("model", m.get("name", "")))
    if target in name or name in target:
        print(meta.get("n_ctx_train", meta.get("n_ctx", 131072)))
        sys.exit(0)
print(131072)
' 2>/dev/null || echo 131072)"
    fi

    output=$(( ctx / 4 ))
    [ "$output" -gt 65536 ] && output=65536

    # Append to newline-delimited list; fields separated by tabs.
    MODEL_LIST="${MODEL_LIST}${key}	${file}	${ctx}	${output}
"
done

# Write the new config by passing all dynamic data via environment variables.
# Python reads them from os.environ — zero shell interpolation into source.
new_config="$(
    LLM_MODEL_LIST="$MODEL_LIST" \
    LLM_ACTIVE_MODEL="$ACTIVE_MODEL" \
    LLM_OPENCODE_CONFIG="$OPENCODE_CONFIG" \
    python3 /dev/stdin <<'PYEOF'
import json, os, sys

config_path = os.environ["LLM_OPENCODE_CONFIG"]
active_model = os.environ["LLM_ACTIVE_MODEL"]
model_list_raw = os.environ["LLM_MODEL_LIST"]

with open(config_path) as f:
    config = json.load(f)

models = {}
for line in model_list_raw.splitlines():
    line = line.strip()
    if not line:
        continue
    parts = line.split("\t")
    if len(parts) != 4:
        continue
    key, file_name, ctx_str, output_str = parts
    models[key] = {
        "name": file_name,
        "limit": {
            "context": int(ctx_str),
            "output": int(output_str),
        },
    }

if "provider" not in config:
    config["provider"] = {}
if "local" not in config["provider"]:
    config["provider"]["local"] = {}
config["provider"]["local"]["models"] = models
config["model"] = f"local/{active_model}"

print(json.dumps(config, indent=2))
PYEOF
)"

# Print model list via printf (no interpolation into formatting strings).
print_summary() {
    printf 'Synced %d models to %s\n' "${#MODELS[@]}" "$OPENCODE_CONFIG"
    printf 'Default model: local/%s\n' "$ACTIVE_MODEL"
    printf '\nModels:\n'
    while IFS=$'\t' read -r key file ctx output; do
        [ -z "$key" ] && continue
        printf '  %-30s  %s  (ctx %d, out %d)\n' "$key" "$file" "$ctx" "$output"
    done <<< "$MODEL_LIST"
}

if [ "$DRY_RUN" = true ]; then
    printf '%s\n' "$new_config"
    echo ""
    echo "(dry run — no changes written)"
else
    printf '%s\n' "$new_config" > "$OPENCODE_CONFIG"
    print_summary
fi

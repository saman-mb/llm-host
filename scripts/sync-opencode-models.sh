#!/usr/bin/env bash
# Sync local llama-server models into ~/.config/opencode/opencode.json
# Reads the model registry from config.sh, queries the running server for
# context-window metadata, and writes the opencode provider config.
#
# Usage: scripts/sync-opencode-models.sh [--dry-run]
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
# We use this to pull n_ctx_train (context window) from the metadata.
SERVER_MODELS_JSON=""
if command -v curl &>/dev/null; then
  SERVER_MODELS_JSON="$(curl -sf http://127.0.0.1:${PORT}/v1/models 2>/dev/null || true)"
fi

# Extract n_ctx_train for a given model filename from the server response.
get_context() {
  local model_file="$1"
  if [ -z "$SERVER_MODELS_JSON" ]; then
    echo "131072"
    return
  fi
  local ctx
  ctx="$(echo "$SERVER_MODELS_JSON" | python3 -c "
import sys, json
data = json.load(sys.stdin)
target = '$model_file'
for m in data.get('data', data.get('models', [])):
  meta = m.get('meta', {})
  name = m.get('id', m.get('model', m.get('name', '')))
  if target in name or name in target:
    print(meta.get('n_ctx_train', meta.get('n_ctx', 131072)))
    sys.exit(0)
print(131072)
" 2>/dev/null || echo "131072")"
  echo "$ctx"
}

# Build the models JSON object.
models_json="{"
first=true
for entry in "${MODELS[@]}"; do
  key="${entry%%|*}"
  path="${entry#*|}"
  file="${path##*/}"

  ctx="$(get_context "$file")"
  # Output tokens: typically 1/4 of context, capped at 65536
  output=$(( ctx / 4 ))
  [ "$output" -gt 65536 ] && output=65536

  if [ "$first" = true ]; then
    first=false
  else
    models_json+=","
  fi

  models_json+="
    \"${key}\": {
      \"name\": \"${file}\",
      \"limit\": {
        \"context\": ${ctx},
        \"output\": ${output}
      }
    }"
done
models_json+="
  }"

# Build the full config JSON.
new_config=$(python3 -c "
import json, sys

with open('$OPENCODE_CONFIG') as f:
    config = json.load(f)

models = json.loads('''${models_json}''')

config['provider']['local']['models'] = models

# Set default model to the active one from config.sh
config['model'] = 'local/${ACTIVE_MODEL}'

print(json.dumps(config, indent=2))
")

if [ "$DRY_RUN" = true ]; then
  echo "$new_config"
  echo ""
  echo "(dry run — no changes written)"
else
  echo "$new_config" > "$OPENCODE_CONFIG"
  echo "Synced ${#MODELS[@]} models to $OPENCODE_CONFIG"
  echo "Default model: local/${ACTIVE_MODEL}"
fi

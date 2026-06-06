#!/usr/bin/env bash
# Select which model llama-swap loads, then restart it (non-blocking).
# Usage: scripts/set-model.sh <model-key>
# The key must exist in the MODELS registry in config.sh.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO/config.sh"

key="${1:-}"
if [ -z "$key" ]; then
  echo "usage: $(basename "$0") <model-key>" >&2
  exit 2
fi

# Validate against the registry.
valid=0
for entry in "${MODELS[@]}"; do
  [ "${entry%%|*}" = "$key" ] && valid=1 && break
done
if [ "$valid" -ne 1 ]; then
  echo "error: unknown model '$key'. Known: $(printf '%s ' "${MODELS[@]%%|*}")" >&2
  exit 1
fi

# Persist the selection, then restart so llama-swap picks it up.
mkdir -p "$(dirname "$MODEL_STATE_FILE")"
printf '%s\n' "$key" > "$MODEL_STATE_FILE"
echo "Active model set to '$key'."

# llama-swap loads models on demand — fire a tiny request naming the key so the
# swap starts now; persisting + triggering are decoupled so this never blocks.
systemctl --user enable --now llama-swap.service >/dev/null 2>&1 || true
curl -s --max-time 900 -o /dev/null "http://localhost:$PORT/v1/completions" \
  -H "Content-Type: application/json" \
  -d "{\"model\":\"$key\",\"prompt\":\"x\",\"max_tokens\":1}" &
disown
echo "llama-swap loading '$key' — it will accept requests once the model finishes loading."

#!/usr/bin/env bash
# Select which model llama-server loads, then restart it (non-blocking).
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

# Persist the selection, then restart so the runner picks it up.
mkdir -p "$(dirname "$MODEL_STATE_FILE")"
printf '%s\n' "$key" > "$MODEL_STATE_FILE"
echo "Active model set to '$key'."

# Restart (and ensure enabled, so a stopped server comes back up on the new model).
systemctl --user enable --now llama-server.service >/dev/null 2>&1 || true
systemctl --user restart llama-server.service
echo "llama-server restarting on '$key' — it will accept requests once the model finishes loading."

#!/usr/bin/env bash
# Restart the llama-swap service. Use after editing config.sh.
# Regenerates llama-swap.yaml from config.sh before restarting.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Regenerating llama-swap.yaml from config.sh..."
"$REPO/scripts/gen-swap-config.sh"

systemctl --user restart llama-swap.service
echo "Restarted. Waiting for model to accept completions..."
"$REPO/scripts/wait-ready.sh" "${LLM_HOST_RESTART_TIMEOUT:-900}"

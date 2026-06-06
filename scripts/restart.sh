#!/usr/bin/env bash
# Restart llama-swap. Use after editing llama-swap.yaml or config.sh.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

systemctl --user restart llama-swap.service
echo "Restarted. Waiting for model to accept completions..."
"$REPO/scripts/wait-ready.sh" "${LLM_HOST_RESTART_TIMEOUT:-900}"

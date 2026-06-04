#!/usr/bin/env bash
# Restart the llama-server service. Use after editing config.sh or a runner.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

systemctl --user restart llama-server.service
echo "Restarted. Waiting for model to accept completions..."
"$REPO/scripts/wait-ready.sh" "${LLM_HOST_RESTART_TIMEOUT:-900}"

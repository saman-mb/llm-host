#!/usr/bin/env bash
# Keep llama-server loaded and verify the completion API, not just /health.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO/config.sh"

if ! systemctl --user is-enabled --quiet llm-host-keepwarm.timer; then
  echo "llm-host-keepwarm.timer is disabled; not starting llama-server."
  exit 0
fi

if ! systemctl --user is-active --quiet llama-swap.service; then
  echo "llama-swap.service is not active; starting it."
  systemctl --user start llama-swap.service
fi

"$REPO/scripts/wait-ready.sh" "${LLM_HOST_KEEP_WARM_TIMEOUT:-300}"

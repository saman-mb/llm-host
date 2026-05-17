#!/usr/bin/env bash
# Started by the systemd user service `llama-server.service`.
# Runs llama-server inside the Vulkan toolbox using values from config.sh.
set -e

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO/config.sh"

if [ ! -f "$MODEL_PATH" ]; then
  echo "Model not found: $MODEL_PATH" >&2
  exit 1
fi

exec llama-server \
  -m "$MODEL_PATH" \
  --host "$HOST" \
  --port "$PORT" \
  -c "$CONTEXT" \
  -np "$N_PARALLEL" \
  $EXTRA_FLAGS

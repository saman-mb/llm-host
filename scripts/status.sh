#!/usr/bin/env bash
# At-a-glance health of the llm-host.
set -e

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO/config.sh"

LAN_IP="$(ip -4 addr show | awk '/inet / && $2 !~ /^127\./ && $2 !~ /^172\.17\./ {print $2; exit}' | cut -d/ -f1)"

echo "==> systemd"
systemctl --user is-active llama-swap.service
systemctl --user status llama-swap.service --no-pager 2>&1 | sed -n '1,5p;/Main PID/p;/Active/p' | sort -u

echo
echo "==> listening"
ss -tlnp 2>/dev/null | grep ":$PORT " || echo "(not listening)"

echo
echo "==> health"
if curl -fsS --max-time 3 "http://localhost:$PORT/health" 2>/dev/null; then echo; else echo "(no response)"; fi

echo
echo "==> config"
echo "  model:    $(basename "$MODEL_PATH")"
echo "  context:  $CONTEXT  slots: $N_PARALLEL"
echo "  endpoint: http://$LAN_IP:$PORT/v1"

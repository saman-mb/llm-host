#!/usr/bin/env bash
# Restart the llama-server service. Use after editing config.sh or a runner.
set -e
systemctl --user restart llama-server.service
echo "Restarted. Waiting for model to load..."
for _ in $(seq 1 30); do
  if curl -fsS --max-time 1 http://localhost:8080/health >/dev/null 2>&1; then
    echo "Ready."
    exit 0
  fi
  sleep 1
done
echo "Did not come up within 30s. Check logs: tail ~/.local/share/llama-server.log" >&2
exit 1

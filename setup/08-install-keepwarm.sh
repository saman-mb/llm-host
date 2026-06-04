#!/usr/bin/env bash
# Install the timer that keeps the local LLM completion endpoint warm.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
USER_SYSTEMD="$HOME/.config/systemd/user"

mkdir -p "$USER_SYSTEMD"
install -m 0644 "$REPO/systemd/llm-host-keepwarm.service" "$USER_SYSTEMD/llm-host-keepwarm.service"
install -m 0644 "$REPO/systemd/llm-host-keepwarm.timer" "$USER_SYSTEMD/llm-host-keepwarm.timer"

systemctl --user daemon-reload
systemctl --user enable --now llm-host-keepwarm.timer

echo "Installed and started llm-host-keepwarm.timer"

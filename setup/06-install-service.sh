#!/usr/bin/env bash
# Install the systemd user service that runs llama-server, enable linger
# so it auto-starts at boot without anyone logged in.
set -e

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

mkdir -p ~/.config/systemd/user
cp -f "$REPO/systemd/llama-server.service" ~/.config/systemd/user/
mkdir -p ~/.local/share && touch ~/.local/share/llama-server.log

systemctl --user daemon-reload
sudo loginctl enable-linger "$USER"
systemctl --user enable --now llama-server.service

echo "Service installed and started. Verify:"
echo "  ../scripts/status.sh"

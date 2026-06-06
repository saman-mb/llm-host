#!/usr/bin/env bash
# Install the systemd user service that runs llama-swap (the model router),
# enable linger so it auto-starts at boot without anyone logged in.
set -e

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [ ! -x "$HOME/.local/bin/llama-swap" ]; then
  echo "error: ~/.local/bin/llama-swap not found — install it first:" >&2
  echo "  https://github.com/mostlygeek/llama-swap/releases" >&2
  exit 1
fi

# Generate llama-swap.yaml from the registry in config.sh before first start.
"$REPO/scripts/gen-swap-config.sh"

mkdir -p ~/.config/systemd/user
ln -sf "$REPO/systemd/llama-swap.service" ~/.config/systemd/user/

systemctl --user daemon-reload
sudo loginctl enable-linger "$USER"
systemctl --user enable --now llama-swap.service

echo "Service installed and started. Verify:"
echo "  ../scripts/status.sh"

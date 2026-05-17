#!/usr/bin/env bash
# Install Tailscale and bring up the daemon. Lets you reach this box from
# any device on your tailnet (phone, NAS, other laptops) without exposing
# anything to the public internet.
#
# Auth is interactive: this script prints a URL you must click in a browser
# to add this machine to your tailnet. Free tier covers up to 3 users / 100
# devices, which is plenty for personal use.
set -e

if ! command -v tailscale >/dev/null; then
  echo "==> Installing Tailscale..."
  sudo dnf config-manager addrepo --from-repofile=https://pkgs.tailscale.com/stable/fedora/tailscale.repo
  sudo dnf install -y tailscale
fi

echo "==> Enabling tailscaled..."
sudo systemctl enable --now tailscaled

if tailscale status >/dev/null 2>&1; then
  echo "==> Already on a tailnet:"
  tailscale ip
  echo "==> Hostname (MagicDNS): $(tailscale status --self --json 2>/dev/null | jq -r '.Self.HostName' 2>/dev/null || hostname)"
  exit 0
fi

echo "==> Bringing Tailscale up — click the printed URL to authenticate..."
sudo tailscale up

echo ""
echo "==> Done. Tailscale IP: $(tailscale ip -4)"
echo "==> Reachable from any tailnet device at: http://$(hostname):8080/v1"

#!/usr/bin/env bash
# Pull the kyuz0 Vulkan-RADV image and create the toolbox container.
# Requires kernel params + groups already active (see 01 + 02).
set -e

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO/config.sh"

groups | grep -qw video  || { echo "ERROR: not in 'video' group. Run setup/02-groups.sh then reboot."; exit 1; }
groups | grep -qw render || { echo "ERROR: not in 'render' group. Run setup/02-groups.sh then reboot."; exit 1; }
grep -q 'amdgpu.gttsize=126976' /proc/cmdline || { echo "ERROR: kernel not booted with gttsize. Run setup/01-kernel-params.sh then reboot."; exit 1; }

if toolbox list | grep -qw "$TOOLBOX"; then
  echo "Toolbox '$TOOLBOX' already exists."
  exit 0
fi

toolbox create "$TOOLBOX" \
  --image docker.io/kyuz0/amd-strix-halo-toolboxes:vulkan-radv \
  -- --device /dev/dri --group-add video --security-opt seccomp=unconfined

echo "Toolbox created. Verify:"
echo "  toolbox run -c $TOOLBOX llama-cli --list-devices"

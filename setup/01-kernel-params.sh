#!/usr/bin/env bash
# One-time: set kernel boot params for Strix Halo unified-memory GPU access.
# Requires reboot to take effect. Idempotent — grubby dedupes.
set -e

sudo grubby --update-kernel=ALL --args="amd_iommu=off amdgpu.gttsize=126976 ttm.pages_limit=32505856"

echo "Done. Reboot to activate. Verify after with:"
echo "  cat /proc/cmdline | tr ' ' '\\n' | grep -E 'amdgpu|iommu|ttm'"

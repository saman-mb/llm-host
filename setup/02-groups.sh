#!/usr/bin/env bash
# Add user to video + render groups (needed for toolbox to see /dev/dri and /dev/kfd).
# Requires logout/reboot to take effect.
set -e
sudo usermod -aG video,render "$USER"
echo "Done. Log out and back in (or reboot) for groups to activate."

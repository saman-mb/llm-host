#!/usr/bin/env bash
# Disable GNOME idle-suspend. A machine serving LLM inference must not sleep —
# it kills downloads and breaks LAN access from the agent client.
set -e
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-ac-type 'nothing'
gsettings set org.gnome.settings-daemon.plugins.power sleep-inactive-battery-type 'nothing'
echo "Auto-suspend disabled."

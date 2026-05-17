#!/usr/bin/env bash
# Open port 8080 on firewalld so the NAS can reach llama-server.
set -e
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload
sudo firewall-cmd --list-ports

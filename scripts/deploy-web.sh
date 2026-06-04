#!/usr/bin/env bash
# Build and (re)start the web container.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Use a repo-local docker config so the build doesn't try to use a missing
# credential helper (e.g. leftover "credsStore": "desktop").
if [ -f "$REPO_ROOT/.docker-config/config.json" ]; then
    export DOCKER_CONFIG="$REPO_ROOT/.docker-config"
fi

echo "[deploy-web] building web image..."
docker compose build web

echo "[deploy-web] (re)starting web container..."
docker compose up -d web

echo "[deploy-web] done. http://localhost:8081"

#!/usr/bin/env bash
# Print the model registry from config.sh as JSON:
#   {"active":"<key>","models":[{"key":"...","file":"...gguf","exists":true},...]}
# Consumed by the web control server (/api/models) and the GNOME taskbar.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO/config.sh"

printf '{"active":"%s","models":[' "$ACTIVE_MODEL"
first=1
for entry in "${MODELS[@]}"; do
  key="${entry%%|*}"
  path="${entry#*|}"
  file="${path##*/}"
  file="${file%.gguf}"
  exists=false
  [ -f "$path" ] && exists=true
  [ $first -eq 1 ] || printf ','
  first=0
  printf '{"key":"%s","file":"%s","exists":%s}' "$key" "$file" "$exists"
done
printf ']}\n'

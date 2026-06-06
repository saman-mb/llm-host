#!/usr/bin/env bash
# Print the model registry from config.sh as JSON:
#   {"active":"<key>","models":[{"key":"...","file":"...","exists":true},...]}
# Consumed by the web control server (/api/models) and the GNOME taskbar.
# JSON is emitted via jq -n --arg to avoid shell-interpolation injection.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO/config.sh"

# Build the models array as a JSON string via jq -n --arg for each entry.
# We accumulate entries into a bash array, then assemble them in one jq call.
MODEL_ENTRIES='[]'
for entry in "${MODELS[@]}"; do
    key="${entry%%|*}"
    path="${entry#*|}"
    file="${path##*/}"
    file="${file%.gguf}"
    exists=false
    [ -f "$path" ] && exists=true

    MODEL_ENTRIES="$(
        jq -n \
            --argjson arr "$MODEL_ENTRIES" \
            --arg key "$key" \
            --arg file "$file" \
            --argjson exists "$exists" \
            '$arr + [{"key":$key,"file":$file,"exists":$exists}]'
    )"
done

jq -n \
    --arg active "$ACTIVE_MODEL" \
    --argjson models "$MODEL_ENTRIES" \
    '{"active":$active,"models":$models}'

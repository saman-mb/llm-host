#!/usr/bin/env bash
# scripts/canary.sh — Canary health check for llama-swap / llama-server.
# Runs on a 5-minute timer (systemd/llm-host-canary.timer).
# Checks:
#   1. If a ready model is in /running: fires a cheap completion (temp 0, max 12 tokens),
#      verifies the response is non-empty and printable.
#   2. If /running is empty but GTT memory usage >5 GiB: flags orphaned VRAM.
# On failure: logs via logger (journald) and sends a desktop notification.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO/config.sh"

BASE_URL="http://localhost:${PORT:-8080}"
NOTIFY_ICON="dialog-error"
SCRIPT_NAME="llm-host-canary"

# --- helpers ----------------------------------------------------------------

_log() {
    logger -t "$SCRIPT_NAME" -- "$*"
}

_notify() {
    local summary="$1"
    local body="${2:-}"
    # Attempt desktop notify; tolerate absence of a display or notify-send.
    DISPLAY="${DISPLAY:-:0}" DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/$(id -u)/bus}" \
        notify-send --urgency=critical --icon="$NOTIFY_ICON" "$summary" "$body" 2>/dev/null || true
}

_fail() {
    local msg="$1"
    _log "ERROR: $msg"
    _notify "LLM canary FAILED" "$msg"
    exit 1
}

# --- GTT orphan check -------------------------------------------------------
# Read GTT memory usage from sysfs (AMD GPU). File contains bytes as integer.
GTT_BYTES=0
GTT_FILE="/sys/class/drm/card0/device/mem_info_gtt_used"
if [[ -r "$GTT_FILE" ]]; then
    GTT_BYTES="$(< "$GTT_FILE")"
fi

# Threshold: 5 GiB = 5368709120 bytes
GTT_THRESHOLD=5368709120

# Query /running to see how many models are currently loaded.
RUNNING_COUNT=0
RUNNING_RESP=""
RUNNING_RESP="$(curl -sf --max-time 5 "$BASE_URL/running" 2>/dev/null || true)"
if [[ -n "$RUNNING_RESP" ]]; then
    RUNNING_COUNT="$(printf '%s' "$RUNNING_RESP" | jq 'if type=="array" then length elif type=="object" then ([.. | objects | .id? // empty] | length) else 0 end' 2>/dev/null || echo 0)"
fi

if [[ "$GTT_BYTES" -gt "$GTT_THRESHOLD" && "$RUNNING_COUNT" -eq 0 ]]; then
    GTT_GIB=$(( GTT_BYTES / 1073741824 ))
    MSG="GTT orphan: ${GTT_GIB}GiB in use but /running is empty — possible leaked VRAM"
    _log "WARN: $MSG"
    _notify "LLM GTT orphan detected" "$MSG"
    exit 1
fi

# --- Completion canary -------------------------------------------------------
# Only run if at least one model is ready in /running.
if [[ "$RUNNING_COUNT" -eq 0 ]]; then
    _log "INFO: no models in /running — skipping completion canary"
    exit 0
fi

COMPLETION_URL="$BASE_URL/v1/chat/completions"
RESPONSE="$(curl -sf --max-time 30 "$COMPLETION_URL" \
    -H "Content-Type: application/json" \
    -d '{"model":"any","messages":[{"role":"user","content":"Say OK"}],"temperature":0,"max_tokens":12}' \
    2>/dev/null || true)"

if [[ -z "$RESPONSE" ]]; then
    _fail "completion API returned empty response from $COMPLETION_URL"
fi

# Extract content from choices[0].message.content
CONTENT="$(printf '%s' "$RESPONSE" | jq -r '.choices[0].message.content // empty' 2>/dev/null || true)"

if [[ -z "$CONTENT" ]]; then
    _fail "completion response has empty content: ${RESPONSE:0:200}"
fi

# Printable check: content must consist solely of printable characters (no garbled/binary).
NON_PRINTABLE="$(printf '%s' "$CONTENT" | tr -d '[:print:][:space:]' || true)"
if [[ -n "$NON_PRINTABLE" ]]; then
    _fail "completion content contains non-printable characters (possible model corruption): ${CONTENT:0:80}"
fi

_log "INFO: canary OK — model responding, content='${CONTENT:0:60}'"
exit 0

#!/usr/bin/env bash
# scripts/canary.sh — Canary health check for llama-swap / llama-server.
# Runs on a 5-minute timer (systemd/llm-host-canary.timer).
# Checks:
#   1. If a ready model is in /running: fires a cheap completion (temp 0, max 12 tokens),
#      verifies the response is non-empty and printable.
#   2. If /running is empty but GTT memory usage >5 GiB: flags orphaned VRAM.
# On failure: logs via logger (journald) and sends a desktop notification.
#
# canary_validate() is a sourceable function: other scripts can
#   source scripts/canary.sh && canary_validate "$RESPONSE"
# without triggering the main body. Direct execution is unchanged.
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

# ---------------------------------------------------------------------------
# canary_validate RESPONSE
#   Validates a completion API response string.
#   Returns 0 on success; sets CANARY_FAIL_MSG and returns 1 on failure.
#   Callers check the return value and call _fail if non-zero.
#   Sourceable: safe to call from other scripts after sourcing this file.
# ---------------------------------------------------------------------------
CANARY_FAIL_MSG=""

canary_validate() {
    local response="$1"
    CANARY_FAIL_MSG=""

    # Guard: empty response
    if [[ -z "$response" ]]; then
        CANARY_FAIL_MSG="completion API returned empty response"
        return 1
    fi

    # Extract content from choices[0].message.content
    local content
    content="$(printf '%s' "$response" | jq -r '.choices[0].message.content // empty' 2>/dev/null || true)"

    # Guard: empty content field
    if [[ -z "$content" ]]; then
        CANARY_FAIL_MSG="completion response has empty content: ${response:0:200}"
        return 1
    fi

    # Printable check: content must consist solely of printable characters.
    local NON_PRINTABLE
    NON_PRINTABLE="$(printf '%s' "$content" | tr -d '[:print:][:space:]' || true)"
    if [[ -n "$NON_PRINTABLE" ]]; then
        CANARY_FAIL_MSG="completion content contains non-printable characters (possible model corruption): ${content:0:80}"
        return 1
    fi

    return 0
}

# --- Guard: only run main body when executed directly ----------------------
# When sourced, BASH_SOURCE[0] != $0; skip the main body so callers can
# use canary_validate() in isolation.
if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
    return 0
fi

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

if ! canary_validate "$RESPONSE"; then
    _fail "$CANARY_FAIL_MSG"
fi

# Extract content for logging (already validated above).
CONTENT="$(printf '%s' "$RESPONSE" | jq -r '.choices[0].message.content // empty' 2>/dev/null || true)"
_log "INFO: canary OK — model responding, content='${CONTENT:0:60}'"
exit 0

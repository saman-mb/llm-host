#!/usr/bin/env bash
# Wait until the OpenAI-compatible API can complete a tiny request.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO/config.sh"

TIMEOUT_SECONDS="${1:-900}"
INTERVAL_SECONDS="${LLM_HOST_READY_INTERVAL:-5}"
URL="http://localhost:$PORT/v1/chat/completions"
BODY="$(mktemp)"
trap 'rm -f "$BODY"' EXIT

echo "Waiting up to ${TIMEOUT_SECONDS}s for model readiness at $URL"

deadline=$((SECONDS + TIMEOUT_SECONDS))
while [ "$SECONDS" -lt "$deadline" ]; do
  code="$(
    curl -sS --max-time 30 -o "$BODY" -w "%{http_code}" "$URL" \
      -H "Content-Type: application/json" \
      -d '{
        "model": "any",
        "messages": [{"role": "user", "content": "Reply with exactly: OK"}],
        "max_tokens": 2,
        "temperature": 0,
        "chat_template_kwargs": {"enable_thinking": false}
      }' 2>/dev/null || true
  )"

  if [ "$code" = "200" ] && jq -e '.choices[0].message.content != null' "$BODY" >/dev/null 2>&1; then
    echo "Ready."
    exit 0
  fi

  message="$(jq -r '.error.message // .message // empty' "$BODY" 2>/dev/null || true)"
  if [ -n "$message" ]; then
    echo "Still warming (HTTP $code: $message)"
  else
    echo "Still warming (HTTP ${code:-000})"
  fi

  sleep "$INTERVAL_SECONDS"
done

echo "Model did not become completion-ready within ${TIMEOUT_SECONDS}s." >&2
echo "Check logs: tail ~/.local/share/llama-server.log" >&2
exit 1

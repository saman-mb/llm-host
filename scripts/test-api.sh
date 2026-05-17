#!/usr/bin/env bash
# Smoke test the OpenAI-compatible API. Useful after a model switch.
set -e

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO/config.sh"

URL="http://localhost:$PORT/v1/chat/completions"

echo "==> $URL"
curl -sS "$URL" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "any",
    "messages": [{"role": "user", "content": "Reply with exactly: PONG"}],
    "max_tokens": 20,
    "temperature": 0,
    "chat_template_kwargs": {"enable_thinking": false}
  }' | jq '{
    reply: .choices[0].message.content,
    tg_tok_s: (.usage.completion_tokens / (.timings.predicted_ms / 1000)),
    pp_tok_s: (if .timings.prompt_ms > 0 then .usage.prompt_tokens / (.timings.prompt_ms / 1000) else null end)
  }'

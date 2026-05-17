#!/usr/bin/env bash
# Generate ~256 tokens against a ~700-token prompt, report pp/tg tok/s.
set -e

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO/config.sh"

PROMPT="$(yes 'The quick brown fox jumps over the lazy dog. ' | head -100 | tr -d '\n')Now write a 300-word story about that fox."

curl -sS "http://localhost:$PORT/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -d "$(jq -nc --arg p "$PROMPT" '{
    model:"any",
    messages:[{role:"user", content:$p}],
    max_tokens:256,
    temperature:0,
    chat_template_kwargs:{enable_thinking:false}
  }')" \
| jq '{
    prompt_tokens: .usage.prompt_tokens,
    completion_tokens: .usage.completion_tokens,
    pp_tok_s: (.usage.prompt_tokens / (.timings.prompt_ms / 1000)),
    tg_tok_s: (.usage.completion_tokens / (.timings.predicted_ms / 1000))
  }'

#!/usr/bin/env bash
# Simulates an agent-style request with tool definitions, then reports
# whether the model emitted OpenAI-format tool_calls (good for most agents)
# or stuffed something else into the content field (likely format mismatch).
set -e

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$REPO/config.sh"

URL="http://localhost:$PORT/v1/chat/completions"

REQUEST='{
  "model": "any",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant. Use the provided tools when appropriate."},
    {"role": "user", "content": "What is the weather in Tokyo right now?"}
  ],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "get_weather",
        "description": "Get the current weather for a city.",
        "parameters": {
          "type": "object",
          "properties": {
            "city": {"type": "string", "description": "City name, e.g. Tokyo"}
          },
          "required": ["city"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "search_web",
        "description": "Search the web for current information.",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {"type": "string", "description": "Search query"}
          },
          "required": ["query"]
        }
      }
    }
  ],
  "tool_choice": "auto",
  "max_tokens": 3000,
  "temperature": 0
}'

echo "==> POST $URL"
echo "==> tools: get_weather, search_web"
echo "==> user: What is the weather in Tokyo right now?"
echo

RESP="$(curl -sS "$URL" -H "Content-Type: application/json" -d "$REQUEST")"

TOOL_CALLS="$(echo "$RESP" | jq '.choices[0].message.tool_calls')"
CONTENT="$(echo "$RESP" | jq -r '.choices[0].message.content // ""')"
REASONING="$(echo "$RESP" | jq -r '.choices[0].message.reasoning_content // ""')"

if [ "$TOOL_CALLS" != "null" ] && [ "$TOOL_CALLS" != "[]" ]; then
  echo "==> ✓ Model emitted OpenAI-format tool_calls (good for most agents)"
  echo "$TOOL_CALLS" | jq '.[] | {
    name: .function.name,
    arguments: (.function.arguments | fromjson)
  }'
else
  echo "==> ✗ No tool_calls field. Model may be using a different format."
  echo
  echo "    content field:"
  echo "    $CONTENT" | head -10
  echo
  if [ -n "$REASONING" ]; then
    echo "    reasoning_content (first 300 chars):"
    echo "    ${REASONING:0:300}"
  fi
fi

echo
echo "==> usage:"
echo "$RESP" | jq '.usage'

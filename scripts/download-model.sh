#!/usr/bin/env bash
# Download a GGUF model from HuggingFace into ~/models/<slug>/<file>.
# Uses aria2 with the settings that survive home-router DNS quirks.
#
# Usage:
#   scripts/download-model.sh <hf-repo> <filename> [slug]
#
# Example:
#   scripts/download-model.sh unsloth/Qwen3.6-35B-A3B-GGUF \
#       Qwen3.6-35B-A3B-UD-Q8_K_XL.gguf qwen3.6-35b-a3b
set -e

REPO="$1"
FILE="$2"
SLUG="${3:-$(echo "$FILE" | sed 's/\.gguf$//' | tr '[:upper:]' '[:lower:]')}"

if [ -z "$REPO" ] || [ -z "$FILE" ]; then
  echo "Usage: $0 <hf-repo> <filename> [slug]" >&2
  exit 1
fi

DEST="$HOME/models/$SLUG"
URL="https://huggingface.co/$REPO/resolve/main/$FILE"

mkdir -p "$DEST"
cd "$DEST"

echo "==> Downloading $FILE"
echo "    from: $URL"
echo "    to:   $DEST/$FILE"

aria2c \
  -x 4 -s 4 -k 1M \
  --file-allocation=none \
  --max-tries=0 \
  --retry-wait=10 \
  --console-log-level=warn \
  --summary-interval=30 \
  --async-dns=false \
  --connect-timeout=30 \
  --timeout=60 \
  --disable-ipv6=true \
  -o "$FILE" \
  "$URL"

echo "==> Done. $(du -h "$FILE" | cut -f1) at $DEST/$FILE"
echo "    To use: edit ../config.sh and set MODEL_PATH=\"$DEST/$FILE\""

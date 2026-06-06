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

# Fetch the sha256 HuggingFace publishes for the LFS object up front: it lets
# us skip a file that's already complete and verified (otherwise aria2's
# auto-renaming would happily re-download 30GB to FILE.1.gguf).
EXPECTED="$(curl -s "https://huggingface.co/api/models/$REPO/tree/main?recursive=true" \
  | jq -r --arg f "$FILE" '.[] | select(.path == $f) | .lfs.oid // empty')"

if [ -f "$FILE" ] && [ ! -f "$FILE.aria2" ] && [ -n "$EXPECTED" ]; then
  echo "==> $FILE exists — verifying before deciding to download..."
  if [ "$(sha256sum "$FILE" | cut -d' ' -f1)" = "$EXPECTED" ]; then
    echo "==> Already present and sha256-verified. Nothing to do."
    exit 0
  fi
  echo "    sha256 mismatch — deleting corrupt copy and re-downloading."
  rm -f "$FILE"
fi

echo "==> Downloading $FILE"
echo "    from: $URL"
echo "    to:   $DEST/$FILE"

aria2c \
  -x 4 -s 4 -k 1M \
  --auto-file-renaming=false \
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

# Verify against the sha256 HuggingFace publishes for the LFS object. An
# unclean shutdown can silently drop un-flushed page cache and leave a
# right-sized but corrupt file (this happened on 2026-06-04), so always check.
echo "==> Verifying sha256 (this reads the whole file)..."
if [ -z "$EXPECTED" ]; then
  echo "    WARNING: no sha256 published for $FILE — skipping verification." >&2
else
  ACTUAL="$(sha256sum "$FILE" | cut -d' ' -f1)"
  if [ "$ACTUAL" != "$EXPECTED" ]; then
    echo "    CORRUPT: sha256 mismatch!" >&2
    echo "      expected: $EXPECTED" >&2
    echo "      actual:   $ACTUAL" >&2
    echo "    Delete the file and re-run this script." >&2
    exit 1
  fi
  echo "    OK: sha256 matches ($EXPECTED)"
  # Force the data to disk so a crash can't silently undo a verified download.
  sync "$FILE"
fi

echo "==> Done. $(du -h "$FILE" | cut -f1) at $DEST/$FILE"
echo "    To use: edit ../config.sh and set MODEL_PATH=\"$DEST/$FILE\""

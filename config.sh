#!/usr/bin/env bash
# Central config for the llm-host. Edit, then `scripts/restart.sh`.

TOOLBOX="llama-vulkan-radv"

# --- Model registry ----------------------------------------------------------
# friendly key | absolute path to the .gguf. The FIRST entry is the default
# used when nothing has been selected yet. Switch between them from the website
# or the GNOME taskbar (both write the chosen key to MODEL_STATE_FILE), or run
# `scripts/set-model.sh <key>`.
MODELS=(
  "qwen3.6-35b-a3b-ud|$HOME/models/qwen3.6-35b-a3b/Qwen3.6-35B-A3B-UD-Q6_K.gguf"
  "qwen3.6-27b|$HOME/models/qwen3.6-27b/Qwen3.6-27B-Q8_0.gguf"
  "gemma-4-26b|$HOME/models/gemma-4-26b-a4b/gemma-4-26B-A4B-it-Q8_0.gguf"
  "gpt-oss-120b|$HOME/models/gpt-oss-120b/gpt-oss-120b-mxfp4-00001-of-00003.gguf"
  "lfm2.5-8b-a1b|$HOME/models/LFM2.5-8B-A1B/LFM2.5-8B-A1B-Q4_K_M.gguf"
)

# --- Embedding model registry ------------------------------------------------
# Always-on models served beside the swapped chat models via llama-swap groups.
# Format: "key|/absolute/path/to/model.gguf"
# These are NOT swapped — they stay loaded persistently. Use for embeddings/RAG.
EMBED_MODELS=(
  "nomic-embed-text|$HOME/models/nomic-embed-text/nomic-embed-text-v1.5.Q8_0.gguf"
)

# Where the active model key is persisted between restarts.
MODEL_STATE_FILE="${MODEL_STATE_FILE:-$HOME/.config/llm-host/model}"

HOST="0.0.0.0"
PORT="8080"

# CONTEXT is the TOTAL token budget across all slots. llama-server divides
# it: per-slot context = CONTEXT / N_PARALLEL. Keep a single large slot for
# agent stability; parallel long-running generations have hit llama.cpp's
# timeout/cancel + prompt-cache abort path on this build.
CONTEXT="262144"
N_PARALLEL="1"

# EXTRA_FLAGS is a bash array so flags with spaces or quotes stay intact.
EXTRA_FLAGS=(
  -ngl 999
  -fa 1
  --no-mmap
  --jinja
  --reasoning auto
  --reasoning-format auto
  --reasoning-budget 2048
  --timeout 3600
  --cache-ram 0
  --no-cache-idle-slots
  --ctx-checkpoints 0
  --checkpoint-every-n-tokens -1
)

# Per-model CONTEXT overrides (keyed by model key). Models with no entry use
# the CONTEXT default above. (Both current models train on a 262144 window,
# so neither needs an override — this is here for future models.)
declare -A MODEL_CONTEXT=()

# --- Resolve the active model ------------------------------------------------
# Read the persisted selection; fall back to the first registry entry.
_llm_selected=""
[ -f "$MODEL_STATE_FILE" ] && _llm_selected="$(cat "$MODEL_STATE_FILE" 2>/dev/null)"

ACTIVE_MODEL=""
MODEL_PATH=""
for _llm_entry in "${MODELS[@]}"; do
  _llm_key="${_llm_entry%%|*}"
  _llm_path="${_llm_entry#*|}"
  # First entry seeds the default; an exact match overrides it.
  if [ -z "$ACTIVE_MODEL" ]; then ACTIVE_MODEL="$_llm_key"; MODEL_PATH="$_llm_path"; fi
  if [ "$_llm_key" = "$_llm_selected" ]; then ACTIVE_MODEL="$_llm_key"; MODEL_PATH="$_llm_path"; fi
done
unset _llm_selected _llm_entry _llm_key _llm_path

# Apply a per-model context override if one is set for the active model.
if [ -n "${MODEL_CONTEXT[$ACTIVE_MODEL]:-}" ]; then
  CONTEXT="${MODEL_CONTEXT[$ACTIVE_MODEL]}"
fi

#!/usr/bin/env bash
# Central config for the llm-host. Edit, then `scripts/restart.sh`.

TOOLBOX="llama-vulkan-radv"

MODEL_PATH="$HOME/models/qwen3.6-35b-a3b/Qwen3.6-35B-A3B-UD-Q8_K_XL.gguf"

HOST="0.0.0.0"
PORT="8080"
CONTEXT="32768"
N_PARALLEL="4"
EXTRA_FLAGS="-ngl 999 -fa 1 --no-mmap --jinja"

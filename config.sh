#!/usr/bin/env bash
# Central config for the llm-host. Edit, then `scripts/restart.sh`.

TOOLBOX="llama-vulkan-radv"

MODEL_PATH="$HOME/models/qwen3.6-35b-a3b/Qwen3.6-35B-A3B-UD-Q8_K_XL.gguf"

HOST="0.0.0.0"
PORT="8080"

# CONTEXT is the TOTAL token budget across all slots. llama-server divides
# it: per-slot context = CONTEXT / N_PARALLEL. OpenCode's system prompt +
# tools already eats ~8K, so don't go below ~32K per slot.
CONTEXT="524288"
N_PARALLEL="2"
EXTRA_FLAGS="-ngl 999 -fa 1 --no-mmap --jinja --reasoning auto --reasoning-format deepseek --reasoning-budget 2048"

# Models

Which model to use when, and why.

## Active / Daily Driver

**`qwen3.6-35b-a3b-ud`** — `Qwen3.6-35B-A3B-UD-Q6_K.gguf` (27 GB)

- Mixture-of-Experts: 35B total, ~3B active per token
- Fast inference on the Strix Halo iGPU (Vulkan) — low latency for interactive use
- Unsloth Dynamic (UD) quant → better quality per bit than standard Q6_K
- Primary model for Hermes Agent, quick code edits, chat, research

## Overnight / Batch

**`qwen3.6-27b`** — `Qwen3.6-27B-Q8_0.gguf` (27 GB)

- Dense 27B at full Q8_0 — the highest quality on this machine
- All 27B params active = ~5-8× slower than the MoE 35B
- Use for long-running work: deep refactors, test generation, documentation sweeps, research synthesis
- Kick off before bed, review the PR in the morning

## Why Not Just Use One?

| | MoE 35B-A3B | Dense 27B Q8_0 |
|---|---|---|
| Active params | ~3B | 27B |
| Effective quality | Very good for size | Best available |
| Speed (on iGPU) | Fast (interactive) | Slow (overnight only) |
| Best for | Chat, coding, agent loops | Deep reasoning, batch work |

They complement each other — the 35B handles your day, the 27B handles your nights.

## Reference

| Key | File | Quant | Type | Size |
|-----|------|-------|------|------|
| `gemma-4-26b` | Gemma-4-26B-A4B-it-Q8_0 | Q8_0 | MoE 26B-A4B | 24 GB |
| `qwen3.6-35b-a3b-ud` | Qwen3.6-35B-A3B-UD-Q6_K | UD-Q6_K | MoE 35B-A3B | 27 GB |
| `qwen3.6-27b` | Qwen3.6-27B-Q8_0 | Q8_0 | Dense 27B | 27 GB |
| `gpt-oss-120b` | gpt-oss-120b-mxfp4 (3 shards) | MXFP4 | MoE 120B-A5B | 63 GB |

### Embeddings (always-on, not swapped)

Served in the `embeddings` llama-swap group alongside whichever chat model is active.
They stay loaded persistently — no swap, no exclusive lock — on port 8080 via llama-swap routing.

| Key | File | Quant | Type | Size |
|-----|------|-------|------|------|
| `nomic-embed-text` | nomic-embed-text-v1.5.Q8_0 | Q8_0 | Embed 137M | ~0.1 GB |

Download: `huggingface-cli download nomic-ai/nomic-embed-text-v1.5-GGUF nomic-embed-text-v1.5.Q8_0.gguf --local-dir ~/models/nomic-embed-text/`

## Lemonade Server (installed, disabled)

AMD's Lemonade Server v10.6.0 is installed system-wide (RPM) and staged but **not running**.
Start/stop: `systemctl --user start lemond` / `stop`. OpenAI-compatible API on
`http://localhost:13305/api/v1`; sees every GGUF under `~/models` via `extra_models_dir`
(config: `~/.cache/lemonade/config.json`, ctx 131072, LAN broadcast off).

Why it exists: it is the only server that can drive the XDNA2 NPU. As of June 2026 the
NPU+iGPU *hybrid* mode (prefill on NPU) is **Windows-only**; Linux supports NPU-only
inference via FastFlowLM (needs NPU firmware ≥ 1.1, IOMMU enabled — not set up yet).
For GGUFs on Linux it wraps the same llama.cpp Vulkan we already run, so it adds no
throughput — keep llama-server/llama-swap as the primary stack.

## Headroom (measured 2026-06-05)

iGPU-addressable GTT is 124 GiB; the daily driver uses only ~35 GiB (28 GB weights +
~5 GB KV at 262k — MoE GQA keeps KV cheap). ~90 GiB spare. Step-up candidates that fit
comfortably with full context: GPT-OSS-120B MXFP4 (~63 GB, ~45–55 tok/s tg, community
default on 128 GB Strix Halo), GLM-4.5/4.6-Air Q4_K_XL (~70 GB, ~20–25 tok/s, stronger
reasoning). Qwen3-235B-A22B Q3_K_XL fits (~100 GB) but ~10 tok/s and tight context.

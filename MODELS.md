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
| `qwen3-next-80b` | Qwen3-Next-80B-A3B-Instruct-Q5_K_M | Q5_K_M | MoE 80B-A3B | 47 GB |
| `gemma-4-26b` | Gemma-4-26B-A4B-it-Q8_0 | Q8_0 | MoE 26B-A4B | 24 GB |
| `qwen3.6-35b-a3b` | Qwen3.6-35B-A3B-Q6_K | Q6_K | MoE 35B-A3B | 27 GB |
| `qwen3.6-35b-a3b-ud` | Qwen3.6-35B-A3B-UD-Q6_K | UD-Q6_K | MoE 35B-A3B | 27 GB |
| `qwen3.6-27b` | Qwen3.6-27B-Q8_0 | Q8_0 | Dense 27B | 27 GB |

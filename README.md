# llm-host

Local LLM serving on a Framework Desktop (AMD Strix Halo, 125 GB unified RAM).
Runs llama.cpp's `llama-server` inside a Vulkan toolbox container, exposed as
an OpenAI-compatible API on `0.0.0.0:8080` for agent clients on the LAN.

## Architecture

```
NAS (agent client) ──HTTP──> Framework Desktop : 8080
                                    │
                                    ▼
                  systemd --user: llama-server.service
                                    │ (Restart=always, linger=on)
                                    ▼
                  toolbox run -c llama-vulkan-radv
                                    │
                                    ▼
                  llama-server  (Vulkan RADV → Radeon 8060S iGPU)
                                    │
                                    ▼
                  GGUF model in ~/models/<slug>/<file>.gguf
```

- **Why Vulkan, not ROCm:** Strix Halo's gfx1151 has spotty ROCm support as of
  early 2026; the kyuz0/amd-strix-halo-toolboxes Vulkan-RADV image is stable
  and lands within ~10% of ROCm performance for inference.
- **Why a toolbox container:** isolates the bleeding-edge llama.cpp + graphics
  stack from the host. The host stays a vanilla Fedora.

## Day-to-day

```sh
scripts/status.sh           # is it running, what model, what endpoint
scripts/logs.sh             # tail logs
scripts/restart.sh          # after editing config.sh
scripts/test-api.sh         # smoke test the /v1/chat/completions endpoint
scripts/benchmark.sh        # measure pp + tg tok/s
```

## Switching models

1. Download:
   ```
   scripts/download-model.sh <hf-repo> <filename> [slug]
   ```
2. Edit `config.sh` and update `MODEL_PATH`.
3. `scripts/restart.sh`.

## API for the NAS agent

```
endpoint: http://<framework-desktop-ip>:8080/v1
api_key:  any string (server doesn't authenticate)
```

For Qwen3.6 (which has hybrid thinking), agent clients should send:

```json
{ "chat_template_kwargs": { "enable_thinking": false } }
```

Otherwise the model produces `<think>...</think>` traces before its answer,
which inflates latency and confuses non-aware clients.

## Configuration

All knobs live in `config.sh`:

| Var | What |
|---|---|
| `TOOLBOX` | Toolbx container name |
| `MODEL_PATH` | Absolute path to .gguf file |
| `HOST` | `0.0.0.0` for LAN, `127.0.0.1` for local-only |
| `PORT` | TCP port |
| `CONTEXT` | Context window per slot |
| `N_PARALLEL` | Concurrent request slots (each gets `CONTEXT` tokens) |
| `EXTRA_FLAGS` | Pass-through to `llama-server` |

## First-time setup

See [`setup/README.md`](setup/README.md). Idempotent — safe to re-run.

## Hardware-specific notes

- **GPU sees 127 GB:** `amdgpu.gttsize=126976` kernel arg unlocks the unified
  memory. Confirm with `dmesg | grep 'GTT memory'`.
- **Auto-suspend disabled:** GNOME defaults to suspending after 15 min idle,
  which kills downloads and breaks LAN access. `setup/03-power.sh` turns it off.
- **DHCP IP shifts on reboot.** Set a static lease in the router for the
  NAS-facing MAC, or front this with Tailscale, so the agent's endpoint stays
  stable.

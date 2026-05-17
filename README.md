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

## API for the NAS agent / iPhone / anywhere

Three ways to reach the server, in order of preference:

| Where you are | URL | Notes |
|---|---|---|
| On the same machine | `http://127.0.0.1:8080/v1` | Loopback, fastest |
| Any tailnet device (recommended) | `http://framework:8080/v1` | Works from anywhere — home, cellular, abroad. WireGuard-encrypted. Setup: `setup/07-tailscale.sh` |
| Same LAN, no Tailscale | `http://framework.local:8080/v1` | mDNS — only works on the same broadcast domain |

```
api_key:  any string (server doesn't authenticate)
model:    any string (server only has one model loaded)
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
- **DHCP IP shifts on reboot.** Tailscale solves this — `framework:8080`
  resolves consistently regardless of LAN IP changes. Use mDNS
  (`framework.local`) as a LAN-only fallback. Don't depend on the raw `10.0.0.x`
  IP — it will change.

## Mobile / off-network access

With Tailscale set up (`setup/07-tailscale.sh`), you can chat with the model
from your phone over cellular, from another house, anywhere. Recommended iOS
client: [Enchanted](https://apps.apple.com/app/enchanted-llm/id6474268307)
(free, open source, native). Point it at `http://framework:8080/v1`.

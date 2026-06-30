# Cinematic AI Music-Video Pipeline (ComfyUI on Strix Halo / ROCm)

Reference-photo → identity-locked keyframe → cinematic video → 4K clip, on an AMD
Ryzen AI MAX+ 395 (Radeon 8060S iGPU, gfx1151, 128GB unified memory), Fedora 44, ROCm 7.2.

Set up: 2026-06-12. Everything lives in `~/dev/ComfyUI/`.

---

## 1. What was installed

### Custom nodes (`~/dev/ComfyUI/custom_nodes/`)
| Node | Repo | Purpose |
|---|---|---|
| ComfyUI-WanVideoWrapper | github.com/kijai/ComfyUI-WanVideoWrapper | Wan 2.2 wrapper + camera embeds (alt path) |
| ComfyUI-LTXVideo | github.com/Lightricks/ComfyUI-LTXVideo | LTX-2.3 video+audio (alt path) |
| ComfyUI-GGUF | github.com/city96/ComfyUI-GGUF | Loads GGUF diffusion models (`UnetLoaderGGUF`, `CLIPLoaderGGUF`) — the primary Wan path on ROCm |
| ComfyUI-Frame-Interpolation | github.com/Fannovel16/ComfyUI-Frame-Interpolation | RIFE / FILM frame interpolation |
| comfyui-propost | github.com/digitaljohn/comfyui-propost | Film grain, vignette, LUT, radial blur |
| ComfyUI-IPAdapter-Flux | github.com/Shakker-Labs/ComfyUI-IPAdapter-Flux | FLUX.1 IP-Adapter loader/apply |
| ComfyUI-KJNodes | github.com/kijai/ComfyUI-KJNodes | Helper nodes used by Wan/LTX workflows |

Already present: ComfyUI-AnimateDiff-Evolved, ComfyUI_IPAdapter_plus, ComfyUI-PiD, ComfyUI-VideoHelperSuite.

**One patch applied:** `ComfyUI-LTXVideo/pyramid_blending.py` imported `pad` from
`kornia.geometry.transform.pyramid`, which the released kornia (≤0.8.3, latest) does not
export — the node was written against an unreleased kornia. Added a 2-line compat shim
(`pad = F.pad` wrapper). Without it the whole LTX node fails to import. If you `git pull`
the node and it breaks again, re-apply the shim.

### Models downloaded
GGUF quantised throughout — best fit for shared-memory ROCm. Logged to `~/.hermes/download-log.md`.

| Model | File | Folder |
|---|---|---|
| Wan 2.2 I2V 14B high-noise (Q6_K) | `HighNoise/Wan2.2-I2V-A14B-HighNoise-Q6_K.gguf` | `models/diffusion_models/` |
| Wan 2.2 I2V 14B low-noise (Q6_K) | `LowNoise/Wan2.2-I2V-A14B-LowNoise-Q6_K.gguf` | `models/diffusion_models/` |
| Wan VAE (14B uses the 2.1 VAE) | `wan_2.1_vae.safetensors` | `models/vae/` |
| Wan text encoder (umt5-xxl bf16) | `models_t5_umt5-xxl-enc-bf16.pth` | `models/text_encoders/` |
| LTX 2.3 22B distilled (Q4_K_M) | `ltx-2.3-22b-distilled-Q4_K_M.gguf` | `models/unet/` |
| LTX 2.3 video VAE | `ltx-2.3-22b-distilled_video_vae.safetensors` | `models/vae/` |
| LTX 2.3 audio VAE | `ltx-2.3-22b-distilled_audio_vae.safetensors` | `models/vae/` |
| LTX 2.3 embeddings connectors | `ltx-2.3-22b-distilled_embeddings_connectors.safetensors` | `models/text_encoders/` |
| Gemma-3 12B text encoder (for LTX) | `gemma-3-12b-it-Q4_K_M.gguf` | `models/text_encoders/` |
| FLUX IP-Adapter (InstantX) | `ip-adapter.bin` | `models/ipadapter-flux/` |
| SigLIP vision (for FLUX IP-Adapter) | `siglip_so400m_patch14_384.safetensors` | `models/clip_vision/` |

Wan Q6_K ≈ 12GB per expert (~24GB for the pair); Q8_0 also exists (~15.4GB each) if you
want max quality — 128GB RAM handles it. The `umt5_xxl_fp16.safetensors` (11.4GB) is the
higher-quality text encoder alternative to the fp8 one above.

### Symlinked from `~/models/from-video/` into ComfyUI
- AnimateDiff Lightning motion modules → `models/animatediff_models/animatediff_lightning_{1,2,4,8}step.safetensors`
- AnimateDiff v1.4 / v1.5 motion adapters → `guoyww_mm_sd_v14.safetensors`, `guoyww_mm_sd_v15_v3.safetensors`
- AnimateDiff SDXL beta motion module → `mm_sdxl_v10_beta.safetensors`
- SDXL base 1.0 → `models/checkpoints/sd_xl_base_1.0.safetensors`

---

## 2. How to launch ComfyUI (ROCm, Strix Halo)

```bash
cd ~/dev/ComfyUI
HSA_OVERRIDE_GFX_VERSION=11.5.1 .venv/bin/python main.py \
  --force-fp16 --disable-mmap --bf16-vae --cache-none --use-pytorch-cross-attention
# GUI: http://127.0.0.1:8188   (this setup test used --port 8199)
```

Verified boot detects the GPU, not CPU:
```
Total VRAM 126976 MB, total RAM 127565 MB
pytorch version: 2.12.0+rocm7.2   AMD arch: gfx1151   ROCm version: (7, 2)
Device: cuda:0 AMD Radeon 8060S : native   Using pytorch attention
```

Why these flags (all matter on gfx1151):
- `--disable-mmap` — **critical on Strix Halo**; mmap breaks down past ~64GB, which big GGUFs hit.
- `--bf16-vae` — avoids OOM during VAE decode.
- `--cache-none` — aggressive unified-memory management.
- `--use-pytorch-cross-attention` — Sage/Flash attention aren't available on gfx1151; force PyTorch SDPA.
- `--force-fp16` — AMD performance.
- `HSA_OVERRIDE_GFX_VERSION=11.5.1` — pins the HSA target to the gfx1151 arch.

The venv is **uv-managed** (`.venv/`, no `pip`). Use `VIRTUAL_ENV=.venv uv pip install ...`,
and pin torch with a constraints file so ROCm wheels aren't clobbered:
```bash
VIRTUAL_ENV=$PWD/.venv uv pip freeze | grep -E '^(torch|torchvision|torchaudio)==' > /tmp/torch.txt
VIRTUAL_ENV=$PWD/.venv uv pip install -r <node>/requirements.txt -c /tmp/torch.txt
```

---

## 3. How to use the workflow

File: `~/dev/ComfyUI/user/default/workflows/music-video-pipeline.json` (load via the ComfyUI menu).

Pipeline, left to right (three coloured groups):

**A. Keyframe — Flux + IP-Adapter (identity/style lock)**
1. `LoadImage` — drop your reference photo here (set the filename).
2. `CheckpointLoaderSimple` — FLUX.1-dev fp8.
3. `IPAdapterFluxLoader` + `ApplyIPAdapterFlux` — locks the reference identity/style onto the Flux model. Tune `weight` (default 1.0).
4. Two `CLIPTextEncode` — positive prompt uses placeholder slots:
   `{SCENE DIRECTION}`, `{CAMERA ANGLE}`, `{FACIAL EXPRESSION}`, `{VIBE}` — fill these per shot.
5. `KSampler` → `VAEDecode` → produces the identity-locked keyframe image.

**B. Wan 2.2 I2V — video (MoE two-expert) + camera control**
6. Two `UnetLoaderGGUF` load the high-noise and low-noise experts (Wan 2.2 is a MoE: high
   noise denoises the early steps, low noise the late steps).
7. `CLIPLoader` (umt5, type=`wan`) + `VAELoader` (wan_2.1_vae) + two `CLIPTextEncode`.
8. `CLIPVisionLoader`/`CLIPVisionEncode` feed the keyframe in as the I2V start image's vision conditioning.
9. `WanCameraEmbedding` — the **camera-angle control**. `camera_pose` options: Static, Pan
   Up/Down/Left/Right, Zoom In/Out, etc. (default here: Pan Right).
10. `WanCameraImageToVideo` builds the conditioned latent (width/height/length = 832×480×81).
11. Two `KSamplerAdvanced` run the MoE split: high-noise steps 0→10 (`return_with_leftover_noise=enable`),
    low-noise steps 10→20 (`add_noise=disable`). → `VAEDecode` with the Wan VAE → frames.

**C. Post**
12. `RIFE VFI` — 2× frame interpolation (smoother motion / higher fps).
13. `ProPostFilmGrain` — cinematic grain. Tune `grain_power`, `grain_type`, `shadows`, `highs`.
14. `UpscaleModelLoader` (RealESRGAN_x4plus) + `ImageUpscaleWithModel` — upscale toward 4K.
15. `VHS_VideoCombine` — encodes the final clip (h264-mp4, 16fps) to `output/musicvideo/`.

Per-shot workflow: change the reference photo, rewrite the four prompt placeholders, pick a
`camera_pose`, queue. Each run outputs one clip.

### Spatial layout / bounding box (requirement notes)
Identity/style is handled by IP-Adapter (group A). For true bbox/regional control add a Flux
ControlNet or a regional-prompt/attention-mask node into group A — no Flux ControlNet weights
are downloaded yet, so that branch is left as an extension point rather than wired blind.

### LTX 2.3 as an alternative video engine
Everything for LTX 2.3 is installed (model, both VAEs, connectors, Gemma-3 encoder, node).
LTX 2.3 is faster and does **synchronised audio** — useful for music videos. To use it, swap
group B for the LTX nodes (`UnetLoaderGGUF` on the LTX gguf in `models/unet/`, `LTXAVTextEncoderLoader`
with the Gemma-3 encoder, `LTXVImgToVideo`, `LTXVConditioning`, `LTXVScheduler`). Note: LTX uses
**Gemma-3**, not t5xxl. Validate ROCm with AMD's official LTX 0.9.5 tutorial first if anything misbehaves.

---

## 4. Component cheat-sheet

| Component | Role |
|---|---|
| FLUX.1-dev + InstantX IP-Adapter | Generates the identity/style-locked keyframe from a reference photo |
| Wan 2.2 I2V 14B (GGUF, MoE) | Primary video model — animates the keyframe; best quality |
| LTX 2.3 22B (GGUF) | Alternative video model — faster, audio-synced |
| umt5-xxl / Gemma-3 | Text encoders (Wan / LTX respectively) |
| WanCameraEmbedding | Camera-move conditioning (pan/zoom/dolly) |
| RIFE VFI | Frame interpolation for smoother motion |
| ProPost Film Grain | Cinematic film-grain / colour post |
| RealESRGAN x4plus | Upscale toward 4K |
| VHS_VideoCombine | Encodes frames to an mp4 clip |

---

## 5. Corrections to the original brief (verified, mid-2026)

- **`h94/IP-Adapter-Flux.1-dev` does not exist.** Used `InstantX/FLUX.1-dev-IP-Adapter`
  + the Shakker-Labs node + SigLIP vision instead (the combo that actually works).
- **"Director LoRAs" is not a real Lightricks name.** The real things are *Camera-Control
  LoRAs* (built on the LTX-2 **19B** base — a different generation to 2.3) and *IC-LoRAs*
  (LTX-2.3: Motion-Track, Union-Control, LipDub, HDR). None downloaded — the camera-control
  LoRAs are base-mismatched to 2.3, and Wan camera motion is handled natively by
  `WanCameraEmbedding`. Add IC-LoRAs later if you standardise on LTX-2.3.
- **Film grain is a node, not a LoRA** — `ProPostFilmGrain` (comfyui-propost). No grain LoRA needed.
- **`hf` Xet backend (`cas-bridge.xethub.hf.co`) deadlocks** on this hf version — every model
  download hung at ~64MB. Fix baked into the download script: `export HF_HUB_DISABLE_XET=1`.
  Use that for any future HF pulls on this box.
- **Wan path:** the native `ComfyUI-GGUF` (`UnetLoaderGGUF`) route is used rather than the
  WanVideoWrapper, because the wrapper assumes Sage/Flash attention kernels that aren't
  available on gfx1151. The wrapper is installed if you want to experiment.

## 6. Re-run the downloads / regenerate the workflow
```bash
cd ~/dev/ComfyUI
./_dl_models.sh                       # idempotent: skips files already present
.venv/bin/python _gen_workflow.py     # regenerates the workflow from /tmp/oi.json
```

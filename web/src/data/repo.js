export default {
  repo: {
    name: "llm-host",
    description: "Local LLM serving on a Framework Desktop (AMD Strix Halo, 125 GB unified RAM). Runs llama.cpp's llama-server inside a Vulkan toolbox container, exposed as an OpenAI-compatible API on 0.0.0.0:8080 for agent clients on the LAN.",
    commits: 7,
    files: 21,
    language: "Bash",
    license: "Proprietary",
    branch: "main"
  },
  
  nav: [
    { id: "overview", label: "Overview" },
    { id: "architecture", label: "Architecture" },
    { id: "layers", label: "Layers" },
    { id: "setup", label: "Setup" },
    { id: "config", label: "Config" },
    { id: "scripts", label: "Scripts" },
    { id: "troubleshooting", label: "Troubleshooting" },
    { id: "repository", label: "Repository" }
  ],
  
  stats: [
    { label: "Commits", value: "7" },
    { label: "Files", value: "21" },
    { label: "RAM", value: "125 GB" },
    { label: "GPU", value: "Radeon 8060S" }
  ],
  
  layers: [
    {
      num: 1,
      title: "Hardware — AMD Strix Halo APU",
      summary: "Ryzen AI MAX+ 395 (16c/32t Zen 5), Radeon 8060S iGPU (RDNA 3.5, 40 CUs), 125 GB LPDDR5 unified memory",
      details: ["CPU: Ryzen AI MAX+ 395 (16c/32t Zen 5)", "iGPU: Radeon 8060S (RDNA 3.5, 40 CUs, gfx1151)", "Memory: 125 GB LPDDR5, unified (shared between CPU and iGPU)"],
      callout: "The iGPU can address up to 124 GB of system RAM as GTT — enough for massive models without multi-GPU rigs."
    },
    {
      num: 2,
      title: "Kernel Boot Params",
      summary: "One-time grubby config: amd_iommu=off, amdgpu.gttsize=126976, ttm.pages_limit=32505856",
      details: ["amd_iommu=off — Stability on Strix Halo", "amdgpu.gttsize=126976 — Exposes 124 GB GTT (single most important param)", "ttm.pages_limit=32505856 — Page cap matching gttsize"],
      callout: "Without gttsize, the iGPU would only see a few GB regardless of how much RAM you have."
    },
    {
      num: 3,
      title: "Container — Toolbx + Podman",
      summary: "kyuz0/amd-strix-halo-toolboxes vulkan-radv image, isolated from host Fedora 44",
      details: ["Container image: kyuz0/amd-strix-halo-toolboxes:vulkan-radv", "Isolates bleeding-edge GPU stack from host", "Host stays vanilla Fedora", "Created by setup/05-create-toolbox.sh, persists between reboots"],
      callout: "Why container? Isolates GPU stack, easy to swap backends, no host pollution."
    },
    {
      num: 4,
      title: "Inference Engine — llama.cpp",
      summary: "llama-server HTTP server with OpenAI-compatible /v1 API, concurrent slots, built-in WebUI",
      details: ["Not Ollama, not vLLM — raw llama.cpp", "OpenAI-compatible /v1/chat/completions, /v1/models", "Multiple concurrent request slots", "Built-in WebUI at root URL"],
      callout: "Everything else (model management, monitoring, systemd unit) is plumbing around llama-server."
    },
    {
      num: 5,
      title: "GPU Backend — Vulkan via Mesa RADV",
      summary: "Mesa's open-source AMD Vulkan driver, ~10% from ROCm performance on Strix Halo",
      details: ["RADV: mature open-source AMD Vulkan driver", "Works on gfx1151 today, no ROCm version juggling", "~10% from ROCm per kyuz0 benchmarks", "More stable on new silicon"],
      callout: "Alternatives: rocm-7.2.3 (faster but less stable), rocm-6.4.4 (older stable), vulkan-amdvlk (fastest, 2GB buffer limit)."
    },
    {
      num: 6,
      title: "Model — Qwen3.6-35B-A3B",
      summary: "MoE architecture, 35B total / 3B active params, UD-Q8_K_XL quantization, ~38 GB on NVMe, 256K native context",
      details: ["Format: GGUF (llama.cpp native)", "MoE: 35B total, ~3B active per token", "Quantization: Unsloth's UD-Q8_K_XL — near-lossless vs BF16", "Native context: 256K tokens", "Loaded with --no-mmap for pinned GPU memory access"],
      callout: "Only ~3B params fire per token despite 35B total — that's why generation is fast (~80 tok/s)."
    },
    {
      num: 7,
      title: "Process Supervision — systemd user service",
      summary: "llama-server.service with Restart=always, Linger=on for boot without login",
      details: ["Restart=always — recovers from crashes after 10s", "Linger=on via loginctl enable-linger", "Logs to ~/.local/share/llama-server.log", "Unit calls bin/serve → toolbox run → runners/llama-server.sh"],
      callout: "Service starts at boot without anyone logged in. Survives reboots and crashes."
    },
    {
      num: 8,
      title: "Network Exposure",
      summary: "HTTP on 0.0.0.0:8080, firewall-cmd, avahi mDNS (framework.local)",
      details: ["Bind: 0.0.0.0:8080 for LAN access", "Firewall: port 8080/tcp (permanent)", "Discovery: avahi-daemon advertises framework.local via mDNS", "No auth — LAN trust only, don't expose publicly"],
      callout: "Set static DHCP lease or use Tailscale for stable endpoint."
    },
    {
      num: 9,
      title: "Clients",
      summary: "OpenCode TUI (localhost), Hermes agent on NAS (LAN), any OpenAI-compatible client",
      details: ["OpenCode (TUI): http://127.0.0.1:8080/v1", "Hermes agent: http://framework.local:8080/v1 over LAN", "Any OpenAI-compatible tool works", "Thinking disabled via chat_template_kwargs"],
      callout: "For Qwen3.6 hybrid thinking: send { chat_template_kwargs: { enable_thinking: false } } to avoid <think>...</think> traces."
    }
  ],
  
  config: {
    title: "Configuration (config.sh)",
    description: "All knobs live in config.sh. Edit, then run scripts/restart.sh.",
    vars: [
      { name: "TOOLBOX", value: "llama-vulkan-radv", desc: "Toolbx container name" },
      { name: "MODEL_PATH", value: "~/models/qwen3.6-35b-a3b/Qwen3.6-35B-A3B-UD-Q8_K_XL.gguf", desc: "Absolute path to .gguf file" },
      { name: "HOST", value: "0.0.0.0", desc: "0.0.0.0 for LAN, 127.0.0.1 for local-only" },
      { name: "PORT", value: "8080", desc: "TCP port" },
      { name: "CONTEXT", value: "524288", desc: "Total token budget across all slots (per-slot = CONTEXT / N_PARALLEL)" },
      { name: "N_PARALLEL", value: "2", desc: "Concurrent request slots (each gets CONTEXT/N_PARALLEL tokens)" },
      { name: "EXTRA_FLAGS", value: "-ngl 999 -fa 1 --no-mmap --jinja --reasoning auto --reasoning-format deepseek --reasoning-budget 2048", desc: "Pass-through to llama-server" }
    ]
  },
  
  scripts: [
    { name: "status.sh", desc: "Is it running, what model, what endpoint", usage: "scripts/status.sh", example: "Shows systemd status, listening port, health check, model name, context size, and LAN endpoint" },
    { name: "logs.sh", desc: "Tail logs", usage: "scripts/logs.sh", example: "exec tail -F ~/.local/share/llama-server.log" },
    { name: "restart.sh", desc: "After editing config.sh or runner", usage: "scripts/restart.sh", example: "Restarts systemd service, polls health for 30s, reports ready or failure" },
    { name: "test-api.sh", desc: "Smoke test /v1/chat/completions", usage: "scripts/test-api.sh", example: "Sends PONG request, reports reply + tokens/s" },
    { name: "benchmark.sh", desc: "Measure pp + tg tok/s", usage: "scripts/benchmark.sh", example: "Generates ~256 tokens, reports prompt tokens, completion tokens, prompt tokens/s, tokens/s" },
    { name: "download-model.sh", desc: "Download GGUF from HuggingFace", usage: "scripts/download-model.sh <hf-repo> <filename> [slug]", example: "scripts/download-model.sh unsloth/Qwen3.6-35B-A3B-GGUF Qwen3.6-35B-A3B-UD-Q8_K_XL.gguf" },
    { name: "test-tools.sh", desc: "Test tool call format (agent compatibility)", usage: "scripts/test-tools.sh", example: "Simulates agent request with get_weather + search_web tools, checks OpenAI-format tool_calls output" }
  ],
  
  setup: [
    { step: 1, name: "01-kernel-params.sh", desc: "Set amdgpu.gttsize=126976, ttm.pages_limit, amd_iommu=off", cmd: "sudo ./setup/01-kernel-params.sh", reboot: true },
    { step: 2, name: "02-groups.sh", desc: "Add user to video, render groups", cmd: "./setup/02-groups.sh", reboot: true },
    { step: 3, name: "Reboot", desc: "Required after steps 1+2", cmd: "sudo systemctl reboot", reboot: false },
    { step: 4, name: "03-power.sh", desc: "Disable GNOME idle-suspend", cmd: "./setup/03-power.sh", reboot: false },
    { step: 5, name: "04-firewall.sh", desc: "Open port 8080/tcp", cmd: "./setup/04-firewall.sh", reboot: false },
    { step: 6, name: "05-create-toolbox.sh", desc: "Pull vulkan-radv image, create container", cmd: "./setup/05-create-toolbox.sh", reboot: false },
    { step: 7, name: "06-install-service.sh", desc: "Install + enable llama-server.service", cmd: "./setup/06-install-service.sh", reboot: false }
  ],
  
  commits: [
    { hash: "0e688a1", message: "Add ARCHITECTURE.md with mermaid diagram and layer-by-layer breakdown", date: "May 17, 2026" },
    { hash: "ba41132", message: "Add scripts/test-tools.sh", date: "May 17, 2026" },
    { hash: "b9eec4f", message: "CONTEXT=524288 → 262K per slot (Qwen3.6 native max)", date: "May 17, 2026" },
    { hash: "7dfca69", message: "N_PARALLEL=2 → 128K per slot", date: "May 17, 2026" },
    { hash: "012d8e1", message: "Bump CONTEXT to 262K so each slot gets 64K", date: "May 17, 2026" },
    { hash: "98f0e8c", message: "Disable Qwen3.6 thinking by default", date: "May 17, 2026" },
    { hash: "5edc95a", message: "Initial llm-host repo", date: "May 17, 2026" }
  ],
  
  fileTree: [
    { path: ".gitignore", type: "file" },
    { path: "ARCHITECTURE.md", type: "file" },
    { path: "README.md", type: "file" },
    { path: "config.sh", type: "file" },
    { path: "bin/serve", type: "file" },
    { path: "runners/llama-server.sh", type: "file" },
    { path: "scripts/benchmark.sh", type: "file" },
    { path: "scripts/download-model.sh", type: "file" },
    { path: "scripts/logs.sh", type: "file" },
    { path: "scripts/restart.sh", type: "file" },
    { path: "scripts/status.sh", type: "file" },
    { path: "scripts/test-api.sh", type: "file" },
    { path: "scripts/test-tools.sh", type: "file" },
    { path: "setup/01-kernel-params.sh", type: "file" },
    { path: "setup/02-groups.sh", type: "file" },
    { path: "setup/03-power.sh", type: "file" },
    { path: "setup/04-firewall.sh", type: "file" },
    { path: "setup/05-create-toolbox.sh", type: "file" },
    { path: "setup/06-install-service.sh", type: "file" },
    { path: "setup/README.md", type: "file" },
    { path: "systemd/llama-server.service", type: "file" }
  ],
  
  troubleshooting: [
    { symptom: "Service not running", check: "systemctl --user status llama-server and tail ~/.local/share/llama-server.log" },
    { symptom: "Can't reach from LAN", check: "firewall-cmd --list-ports and avahi-resolve -n framework.local" },
    { symptom: "OpenCode context exceeded", check: "CONTEXT and N_PARALLEL in config.sh; per-slot = CONTEXT / N_PARALLEL" },
    { symptom: "Empty responses", check: "max_tokens too low (reasoning budget is 2048; request needs 3000+)" },
    { symptom: "GPU not actually being used", check: "amdgpu_top during a request — GFX should spike to 80%+, SCLK to 2900 MHz" },
    { symptom: "GTT memory wrong / too small", check: "dmesg | grep GTT should show 126976M ready; if not, kernel params didn't apply" },
    { symptom: "Tool calls not parsed by agent", check: "Run scripts/test-tools.sh — if it works locally, agent client expects different format" }
  ],
  
  notThis: [
    "Not Ollama (we use llama.cpp directly)",
    "Not ROCm (Vulkan for Strix Halo stability)",
    "Not multi-GPU (single iGPU with 124 GB effective VRAM)",
    "Not auth-protected (LAN trust only)"
  ]
};

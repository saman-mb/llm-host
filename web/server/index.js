import express from 'express';
import { execSync, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;
const LLAMA_SERVICE = 'llama-swap.service';

// Trust the proxy (Vite dev proxy forwards headers)
app.set('trust proxy', 1);

// JSON body parser (not strictly needed for GET/status, but good practice)
app.use(express.json());

// ---------------------------------------------------------------------------
// UI Spec — single source of truth for the GNOME extension menu.
// Edit this object to add/remove/reorder menu entries; the extension
// re-fetches every `poll` seconds and rebuilds only when the spec changes.
// ---------------------------------------------------------------------------

/** @type {import('./ui-spec.d.ts').UISpec} */
const DEFAULT_UI_SPEC = {
  unit: 'llama-swap.service',
  poll: 10,
  items: [
    // Status row (non-interactive, updated by extension from systemctl)
    { type: 'status', label: 'Status: checking…' },

    // Active model line (non-interactive, updated by extension via /v1/models)
    { type: 'model', label: 'Model: —' },

    { type: 'separator' },

    // Start / Stop toggle — extension flips between start/stop based on unit state
    {
      type: 'toggle',
      label: 'Start LLM',
      labelActive: 'Stop LLM',
      action: { kind: 'systemctl', args: ['start', 'llama-swap.service'] },
      actionActive: { kind: 'systemctl', args: ['stop', 'llama-swap.service'] },
    },

    {
      type: 'action',
      label: 'Restart',
      action: { kind: 'systemctl', args: ['restart', 'llama-swap.service'] },
    },

    // Scripts submenu
    {
      type: 'submenu',
      label: 'Scripts',
      items: [
        {
          type: 'action',
          label: 'Sync model → OpenCode',
          action: { kind: 'script', args: ['sync-opencode-models.sh'] },
        },
        {
          type: 'action',
          label: 'Sync model → Hermes/OpenCode',
          action: { kind: 'script', args: ['sync-model.sh'] },
        },
        {
          type: 'action',
          label: 'Benchmark',
          action: { kind: 'script', args: ['benchmark.sh'] },
        },
        {
          type: 'action',
          label: 'Test API',
          action: { kind: 'script', args: ['test-api.sh'] },
        },
        {
          type: 'action',
          label: 'Status',
          action: { kind: 'script', args: ['status.sh'] },
        },
      ],
    },

    // Switch model — populated dynamically from the model registry
    {
      type: 'submenu',
      label: 'Switch model',
      dynamic: 'models',
      items: [],
    },

    // Embeddings — populated dynamically from the embed registry
    {
      type: 'submenu',
      label: 'Embeddings',
      dynamic: 'embeds',
      items: [],
    },

    // GPU mode
    {
      type: 'submenu',
      label: 'GPU mode',
      items: [
        {
          type: 'action',
          label: 'LLM mode (Qwen)',
          action: { kind: 'http', args: ['POST', '/api/gpu-mode', { mode: 'llm' }] },
        },
        {
          type: 'action',
          label: 'Image mode (ComfyUI)',
          action: { kind: 'http', args: ['POST', '/api/gpu-mode', { mode: 'image' }] },
        },
      ],
    },

    { type: 'separator' },

    {
      type: 'action',
      label: 'Open ComfyUI ↗',
      action: { kind: 'url', args: ['http://127.0.0.1:8188'] },
    },
    {
      type: 'action',
      label: 'Launch chat ↗',
      action: { kind: 'url', args: ['http://localhost:8080'] },
    },
    {
      type: 'action',
      label: 'Open web control ↗',
      action: { kind: 'url', args: ['http://localhost:8081'] },
    },
    {
      type: 'action',
      label: 'Tail journal',
      action: { kind: 'script', args: ['_journal'] },
    },
  ],
};

// ---------------------------------------------------------------------------
// llama-server helpers
// ---------------------------------------------------------------------------

function systemctl(args) {
  return execSync(`systemctl --user ${args}`, {
    encoding: 'utf-8',
    maxBuffer: 1024 * 256,
  });
}

function checkLlamaStatus() {
  try {
    const output = execSync('systemctl --user status llama-swap.service', {
      encoding: 'utf-8',
      maxBuffer: 1024 * 512,
    });

    const activeMatch = output.match(/Active:\s+active \([^)]+\)/i);

    if (activeMatch) {
      // Extract uptime from output like "since ...; ... ago"
      const uptimeMatch = output.match(/Active:\s+active \([^)]+\) since\s+(.*?);/);
      const uptime = uptimeMatch ? uptimeMatch[1].trim() : null;

      return { running: true, uptime };
    }

    return { running: false, uptime: null };
  } catch (err) {
    // systemctl may return exit code 3 when the unit is inactive or not found
    // In that case, treat it as not running
    return { running: false, uptime: null };
  }
}

function cleanModelName(name) {
  return name.replace(/\.gguf$/i, '');
}

const SCRIPTS_DIR = join(__dirname, '..', '..', 'scripts');

// Read the model registry + active selection from config.sh via models.sh.
// Returns { active, models: [{ key, file, exists }] } or null on failure.
function readRegistry() {
  try {
    const out = execSync(`bash ${join(SCRIPTS_DIR, 'models.sh')}`, {
      encoding: 'utf-8',
      timeout: 5000,
      maxBuffer: 1024 * 64,
    });
    const reg = JSON.parse(out);

    // Parse EMBED_MODELS directly from config.sh (one "key|path" per line).
    // Sourced in bash with no user input interpolated.
    let embeds = [];
    try {
      const configPath = join(SCRIPTS_DIR, '..', 'config.sh');
      const raw = execSync(
        `bash -c 'source ${configPath}; printf "%s\\n" "\${EMBED_MODELS[@]:-}"'`,
        { encoding: 'utf-8', timeout: 3000, maxBuffer: 1024 * 16 },
      );
      embeds = raw
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .map((line) => {
          const sep = line.indexOf('|');
          if (sep === -1) return null;
          const key = line.slice(0, sep);
          const filePath = line.slice(sep + 1);
          let exists = false;
          try {
            execFileSync('test', ['-f', filePath]);
            exists = true;
          } catch {
            exists = false;
          }
          return { key, exists };
        })
        .filter(Boolean);
    } catch {
      embeds = [];
    }

    reg.embeds = embeds;
    return reg;
  } catch {
    return null;
  }
}

// Fallback: the model configured in config.sh (used when the server is down).
function configuredModel() {
  const reg = readRegistry();
  if (!reg) return null;
  const active = reg.models.find((m) => m.key === reg.active);
  return active ? cleanModelName(active.file) : null;
}

// Authoritative: ask the running llama-server what model is actually loaded,
// falling back to the configured model when it's unreachable.
async function getModelName() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch('http://localhost:8080/v1/models', { signal: ctrl.signal });
    clearTimeout(timer);
    if (res.ok) {
      const j = await res.json();
      const m = (j.models && j.models[0]) || (j.data && j.data[0]) || {};
      const name = m.name || m.id || m.model || '';
      if (name) return cleanModelName(name);
    }
  } catch {
    // server down/unreachable — fall through to configured model
  }
  return configuredModel();
}

// ---------------------------------------------------------------------------
// GPU coordination (Qwen <-> ComfyUI share one iGPU)
// ---------------------------------------------------------------------------

const COMFYUI_URL = 'http://127.0.0.1:8188';

function stopLlama() {
  systemctl(`disable --now ${LLAMA_SERVICE}`);
}

function startLlama() {
  systemctl(`enable --now ${LLAMA_SERVICE}`);
}

// Ask ComfyUI to drop its models from VRAM so the iGPU is free for the LLM.
async function freeComfyUI() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    await fetch(`${COMFYUI_URL}/free`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ unload_models: true, free_memory: true }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return true;
  } catch {
    return false; // ComfyUI not running / unreachable — nothing to free
  }
}

async function comfyuiUp() {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch(`${COMFYUI_URL}/`, { signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// API Routes
// ---------------------------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({
    server: 'llm-host-control',
    version: '1.0.0',
  });
});

// Return the full UI menu spec. The GNOME extension polls this and rebuilds
// its menu only when the spec hash changes.
app.get('/api/ui', (_req, res) => {
  res.json(DEFAULT_UI_SPEC);
});

app.get('/api/status', async (_req, res) => {
  try {
    const status = checkLlamaStatus();
    const model = await getModelName();
    const comfyui = await comfyuiUp();
    // GPU is handed to the LLM when llama-server is up, else free for ComfyUI.
    res.json({ ...status, model, comfyui, gpuMode: status.running ? 'llm' : 'image' });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to check llama-server status',
      detail: err.message,
    });
  }
});

app.post('/api/stop', (_req, res) => {
  try {
    stopLlama();

    const status = checkLlamaStatus();
    if (!status.running) {
      return res.json({
        success: true,
        message: 'llama-server is already stopped and disabled; keep-warm disabled',
      });
    }

    res.json({
      success: true,
      message: 'llama-server stopped and disabled; keep-warm disabled',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to stop llama-server',
      detail: err.message,
    });
  }
});

app.post('/api/start', (_req, res) => {
  try {
    const already = checkLlamaStatus().running;
    startLlama();
    res.json({
      success: true,
      message: already
        ? 'llama-server is already running; keep-warm enabled'
        : 'llama-server enabled and starting; keep-warm enabled',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to start llama-server',
      detail: err.message,
    });
  }
});

// Switch which app owns the iGPU. 'image' = stop Qwen so ComfyUI has the GPU.
// 'llm' = free ComfyUI's VRAM, then start Qwen.
app.post('/api/gpu-mode', async (req, res) => {
  const mode = req.body && req.body.mode;
  if (mode !== 'llm' && mode !== 'image') {
    return res.status(400).json({ success: false, error: "mode must be 'llm' or 'image'" });
  }
  try {
    if (mode === 'image') {
      stopLlama();
      res.json({ success: true, mode, message: 'Image mode: Qwen stopped — iGPU free for ComfyUI.' });
    } else {
      const freed = await freeComfyUI();
      startLlama();
      res.json({
        success: true,
        mode,
        message: `LLM mode: ${freed ? 'ComfyUI VRAM freed; ' : ''}Qwen starting.`,
      });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: `Failed to switch to ${mode} mode`, detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// Model selection
// ---------------------------------------------------------------------------

// List the available models and which one is active.
app.get('/api/models', (_req, res) => {
  const reg = readRegistry();
  if (!reg) {
    return res.status(500).json({ success: false, error: 'Failed to read model registry' });
  }
  res.json(reg);
});

// Switch which model llama-server loads, then restart it.
app.post('/api/model', (req, res) => {
  const key = req.body && req.body.model;
  if (!key || typeof key !== 'string') {
    return res.status(400).json({ success: false, error: 'model (key) is required' });
  }
  const reg = readRegistry();
  if (!reg || !reg.models.some((m) => m.key === key)) {
    return res.status(400).json({ success: false, error: `Unknown model: ${key}` });
  }
  try {
    // `key` is interpolated into the command, but only after being matched
    // against the registry above, so it can only ever be a known model key.
    // set-model.sh validates once more, persists the choice, and restarts.
    execFileSync('bash', [join(SCRIPTS_DIR, 'set-model.sh'), key], {
      encoding: 'utf-8',
      timeout: 30000,
      maxBuffer: 1024 * 64,
    });
    res.json({ success: true, model: key, message: `Switching to ${key} — model is loading.` });
  } catch (err) {
    res.status(500).json({ success: false, error: `Failed to switch to ${key}`, detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// Run whitelisted scripts
// ---------------------------------------------------------------------------

// Map of safe, parameter-free scripts that can be triggered from the web UI.
// Keys are the API names; values are filenames under ../../scripts.
// (Excludes logs.sh — it tails forever — and download-model.sh — needs args.)
const RUNNABLE_SCRIPTS = {
  status: 'status.sh',
  'test-api': 'test-api.sh',
  benchmark: 'benchmark.sh',
  'sync-model': 'sync-model.sh',
  'sync-opencode-models': 'sync-opencode-models.sh',
  'test-tools': 'test-tools.sh',
};

app.post('/api/script/:name', (req, res) => {
  const file = RUNNABLE_SCRIPTS[req.params.name];
  if (!file) {
    return res.status(404).json({ success: false, error: `Unknown script: ${req.params.name}` });
  }
  try {
    // No user input enters the command — `file` comes from the fixed whitelist.
    const output = execSync(`bash ${join(SCRIPTS_DIR, file)} 2>&1`, {
      encoding: 'utf-8',
      timeout: 180000,
      maxBuffer: 1024 * 1024,
    });
    res.json({ success: true, output });
  } catch (err) {
    res.json({
      success: false,
      output: `${err.stdout || ''}${err.stderr || ''}`.trim() || err.message,
      error: err.message,
    });
  }
});

// ---------------------------------------------------------------------------
// Production: serve React build
// ---------------------------------------------------------------------------

const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Catch-all: serve index.html for all non-API routes (SPA support)
app.use((_req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, '127.0.0.1', () => {
  console.log(`llm-host-control server running on port ${PORT}`);
  console.log(`  GET  http://localhost:${PORT}/api/ui`);
  console.log(`  GET  http://localhost:${PORT}/api/status`);
  console.log(`  POST http://localhost:${PORT}/api/stop`);
  console.log(`  POST http://localhost:${PORT}/api/start`);
  console.log(`  GET  http://localhost:${PORT}/api/health`);
});

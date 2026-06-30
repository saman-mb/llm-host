import express from 'express';
import { execSync, execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// JSON body parser — needed for the POST /api/model body.
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
    // === LLM Section ===
    { type: 'status', label: 'LLM: checking…' },
    {
      type: 'toggle',
      label: 'Start LLM',
      labelActive: 'Stop LLM',
      action: { kind: 'systemctl', args: ['start', 'llama-swap.service'] },
      actionActive: { kind: 'systemctl', args: ['stop', 'llama-swap.service'] },
    },
    {
      type: 'submenu',
      label: 'Models',
      dynamic: 'models',
      items: [],
    },

    // === ComfyUI Section ===
    { type: 'separator' },
    { type: 'status', label: 'ComfyUI: checking…' },
    {
      type: 'toggle',
      label: 'Start ComfyUI',
      labelActive: 'Stop ComfyUI',
      action: { kind: 'http', args: ['POST', '/api/comfyui/start', {}] },
      actionActive: { kind: 'http', args: ['POST', '/api/comfyui/stop', {}] },
      unit: 'comfyui.service',
    },
    {
      type: 'submenu',
      label: 'ComfyUI',
      items: [
        {
          type: 'action',
          label: 'Free VRAM',
          action: { kind: 'http', args: ['POST', '/api/comfyui/free', {}] },
        },
        {
          type: 'action',
          label: 'Open ComfyUI ↗',
          action: { kind: 'url', args: ['http://127.0.0.1:8188'] },
        },
      ],
    },

    // === Embeddings Section ===
    { type: 'separator' },
    { type: 'status', label: 'Embeddings: checking…' },
    {
      type: 'submenu',
      label: 'Embeddings',
      dynamic: 'embeds',
      items: [],
    },

    // === Bottom Section ===
    { type: 'separator' },
    {
      type: 'action',
      label: 'Launch chat ↗',
      action: { kind: 'url', args: ['http://localhost:8080'] },
    },
    {
      type: 'action',
      label: 'Tail journal',
      action: { kind: 'script', args: ['_journal'] },
    },
  ],
};

const SCRIPTS_DIR = join(__dirname, '..', 'scripts');

// Read the model registry + active selection from config.sh via models.sh.
// Returns { active, models: [{ key, file, exists }], embeds: [...] } or null.
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

// Ask ComfyUI to drop its models from VRAM so the iGPU is free for the LLM.
const COMFYUI_URL = 'http://127.0.0.1:8188';

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

// ---------------------------------------------------------------------------
// API Routes — consumed by the GNOME extension:
//   /api/health          liveness probe
//   /api/ui              menu spec
//   /api/models          model + embed registry
//   /api/model           switch model
//   /api/comfyui/start   start comfyui.service
//   /api/comfyui/stop    stop comfyui.service
//   /api/comfyui/free    release ComfyUI VRAM
//   /api/service/:unit   generic service status check
//   /api/embeddings      list embed models + running state
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

// Release ComfyUI's VRAM without touching the LLM. Lets the user reclaim the
// iGPU for the coding model on demand while leaving parallel use the default.
app.post('/api/comfyui/free', async (_req, res) => {
  const freed = await freeComfyUI();
  res.json({
    success: true,
    freed,
    message: freed
      ? 'ComfyUI VRAM freed — iGPU reclaimed.'
      : 'ComfyUI not running or unreachable — nothing to free.',
  });
});

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

// Start ComfyUI — systemctl start comfyui.service
app.post('/api/comfyui/start', (_req, res) => {
  try {
    execFileSync('systemctl', ['--user', 'start', 'comfyui.service'], { timeout: 10000 });
    res.json({ success: true, message: 'ComfyUI started.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Stop ComfyUI — systemctl stop comfyui.service
app.post('/api/comfyui/stop', (_req, res) => {
  try {
    execFileSync('systemctl', ['--user', 'stop', 'comfyui.service'], { timeout: 10000 });
    res.json({ success: true, message: 'ComfyUI stopped.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Generic service status check
app.get('/api/service/:unit', (req, res) => {
  const unit = req.params.unit;
  if (!/^[a-zA-Z0-9._-]+\.service$/.test(unit)) {
    return res.status(400).json({ success: false, error: 'Invalid unit name' });
  }
  try {
    const state = execFileSync('systemctl', ['--user', 'is-active', unit], {
      encoding: 'utf-8', timeout: 5000,
    }).trim();
    res.json({ active: state === 'active', state });
  } catch {
    res.json({ active: false, state: 'inactive' });
  }
});

// List embedding models with running state
app.get('/api/embeddings', (_req, res) => {
  const reg = readRegistry();
  if (!reg) return res.status(500).json({ success: false, error: 'Failed to read registry' });

  let running = [];
  try {
    const out = execSync('curl -s --max-time 2 http://localhost:8080/running', { encoding: 'utf-8', timeout: 5000 });
    const data = JSON.parse(out);
    running = (data.running || []).filter(e => e.cmd && e.cmd.includes('--embedding'));
  } catch {}

  const runningKeys = new Set(running.map(e => e.model || e.name));

  res.json({
    embeds: reg.embeds.map(e => ({
      ...e,
      running: runningKeys.has(e.key),
    })),
  });
});

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------

app.listen(PORT, '127.0.0.1', () => {
  console.log(`llm-host-control server running on port ${PORT}`);
  console.log(`  GET  http://localhost:${PORT}/api/ui`);
  console.log(`  GET  http://localhost:${PORT}/api/models`);
  console.log(`  POST http://localhost:${PORT}/api/model`);
  console.log(`  POST http://localhost:${PORT}/api/comfyui/start`);
  console.log(`  POST http://localhost:${PORT}/api/comfyui/stop`);
  console.log(`  POST http://localhost:${PORT}/api/comfyui/free`);
  console.log(`  GET  http://localhost:${PORT}/api/service/:unit`);
  console.log(`  GET  http://localhost:${PORT}/api/embeddings`);
  console.log(`  GET  http://localhost:${PORT}/api/health`);
});

import express from 'express';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = 3001;

// Trust the proxy (Vite dev proxy forwards headers)
app.set('trust proxy', 1);

// JSON body parser (not strictly needed for GET/status, but good practice)
app.use(express.json());

// --- llama-server helpers ---

function checkLlamaStatus() {
  try {
    const output = execSync('systemctl --user status llama-server', {
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

    const deadMatch = output.match(/Active:\s+inactive \(dead\)|dead \(result:\s+'exit-code'\)/i);
    return { running: false, uptime: null };
  } catch (err) {
    // systemctl may return exit code 3 when the unit is inactive or not found
    // In that case, treat it as not running
    return { running: false, uptime: null };
  }
}

// --- API Routes ---

app.get('/api/health', (_req, res) => {
  res.json({
    server: 'llm-host-control',
    version: '1.0.0',
  });
});

app.get('/api/status', (_req, res) => {
  try {
    const status = checkLlamaStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({
      error: 'Failed to check llama-server status',
      detail: err.message,
    });
  }
});

app.post('/api/stop', (_req, res) => {
  try {
    const status = checkLlamaStatus();
    if (!status.running) {
      return res.json({
        success: true,
        message: 'llama-server is already stopped',
      });
    }

    execSync('systemctl --user stop llama-server', {
      encoding: 'utf-8',
      maxBuffer: 1024 * 256,
    });

    res.json({
      success: true,
      message: 'llama-server stopped',
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
    const status = checkLlamaStatus();
    if (status.running) {
      return res.json({
        success: true,
        message: 'llama-server is already running',
      });
    }

    execSync('systemctl --user start llama-server', {
      encoding: 'utf-8',
      maxBuffer: 1024 * 256,
    });

    res.json({
      success: true,
      message: 'llama-server starting...',
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: 'Failed to start llama-server',
      detail: err.message,
    });
  }
});

// --- Production: serve React build ---

const distPath = join(__dirname, '..', 'dist');
app.use(express.static(distPath));

// Catch-all: serve index.html for all non-API routes (SPA support)
app.use((_req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

// --- Start server ---

app.listen(PORT, '0.0.0.0', () => {
  console.log(`llm-host-control server running on port ${PORT}`);
  console.log(`  GET  http://localhost:${PORT}/api/status`);
  console.log(`  POST http://localhost:${PORT}/api/stop`);
  console.log(`  POST http://localhost:${PORT}/api/start`);
  console.log(`  GET  http://localhost:${PORT}/api/health`);
});

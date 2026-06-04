import { useState, useEffect, useCallback } from 'react';

const API_BASE = '/api';

const STATUS_INTERVAL = 10000; // 10 seconds

function useLLMStatus() {
  const [running, setRunning] = useState(false);
  const [model, setModel] = useState(null);
  const [gpuMode, setGpuMode] = useState(null); // 'llm' | 'image'
  const [comfyui, setComfyui] = useState(false);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      const data = await res.json();
      setRunning(data.running);
      setModel(data.model || null);
      setGpuMode(data.gpuMode || null);
      setComfyui(!!data.comfyui);
      setError(null);
    } catch {
      setError('Unable to reach server');
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, STATUS_INTERVAL);
    return () => clearInterval(interval);
  }, [refresh]);

  return { running, model, gpuMode, comfyui, error, refresh };
}

// Switch which app owns the iGPU via the control server.
function useGpuMode(refresh) {
  const [switching, setSwitching] = useState(null); // 'llm' | 'image' | null

  const switchMode = useCallback(async (mode) => {
    setSwitching(mode);
    try {
      await fetch(`${API_BASE}/gpu-mode`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      // Give systemd a moment, then refresh status.
      setTimeout(() => refresh(), 1500);
      setTimeout(() => refresh(), 4000);
    } catch {
      /* status poll will surface any error */
    } finally {
      setTimeout(() => setSwitching(null), 4000);
    }
  }, [refresh]);

  return { switching, switchMode };
}

// Load the model registry and switch which model llama-server loads.
function useModels(refresh) {
  const [models, setModels] = useState([]);
  const [active, setActive] = useState(null);
  const [switchingTo, setSwitchingTo] = useState(null); // model key | null

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/models`);
      const data = await res.json();
      if (Array.isArray(data.models)) {
        setModels(data.models);
        setActive(data.active || null);
      }
    } catch {
      /* leave the picker empty — switching just won't be offered */
    }
  }, []);

  useEffect(() => { loadModels(); }, [loadModels]);

  const switchModel = useCallback(async (key) => {
    setSwitchingTo(key);
    setActive(key); // optimistic
    try {
      await fetch(`${API_BASE}/model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: key }),
      });
      // Reloading the model takes a while; nudge status + registry a few times.
      setTimeout(() => { refresh(); loadModels(); }, 2000);
      setTimeout(() => { refresh(); loadModels(); }, 6000);
    } catch {
      loadModels(); // revert optimistic state to the truth
    } finally {
      setTimeout(() => setSwitchingTo(null), 6000);
    }
  }, [refresh, loadModels]);

  return { models, active, switchingTo, switchModel };
}

function useLLMControl() {
  const [action, setAction] = useState(null); // 'stop' | 'start' | null
  const [message, setMessage] = useState(null);
  const [msgType, setMsgType] = useState(''); // 'success' | 'error'

  const execute = useCallback(async (actionType) => {
    const endpoint = actionType === 'stop' ? 'stop' : 'start';
    setAction(actionType);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE}/${endpoint}`, { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        setMessage(data.message);
        setMsgType('success');
      } else {
        setMessage(data.message || `Failed to ${actionType} server`);
        setMsgType('error');
      }
    } catch {
      setMessage(`Unable to ${actionType} server. Is the API running?`);
      setMsgType('error');
    } finally {
      setAction(null);
    }
  }, []);

  // Clear message after 4 seconds
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => {
        setMessage(null);
        setMsgType('');
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return { action, message, msgType, execute };
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export default function LLMControl() {
  const { running, model, gpuMode, comfyui, error, refresh } = useLLMStatus();
  const { action, message, msgType, execute } = useLLMControl();
  const { switching, switchMode } = useGpuMode(refresh);
  const { models, active, switchingTo, switchModel } = useModels(refresh);
  const [showPollingError, setShowPollingError] = useState(false);

  const isProcessing = action !== null;
  const isStopAction = action === 'stop';

  const handleAction = (actionType) => {
    execute(actionType);
  };

  return (
    <div className="max-w-2xl mx-auto mt-10">
      <div
        className={`
          bg-white rounded-xl border border-slate-200 shadow-sm
          transition-all duration-200 hover:shadow-md
        `}
      >
        {/* Status header bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2.5">
            <span
              className={`
                w-2.5 h-2.5 rounded-full transition-colors duration-300
                ${running ? 'bg-green-500' : 'bg-red-500'}
              `}
              aria-hidden="true"
            />
            <span className="text-sm font-medium text-slate-700">
              {running ? 'LLM Server Running' : 'LLM Server Stopped'}
            </span>
          </div>
          <span className="text-xs text-slate-400">Port 8080</span>
        </div>

        {/* Body */}
        <div className="px-5 py-5">
          {/* Loaded model */}
          {model && (
            <div className="mb-4 flex items-center gap-2 text-xs">
              <span className="uppercase tracking-wide text-slate-400">Model</span>
              <span className="font-mono text-slate-700 break-all">{model}</span>
              {!running && <span className="text-slate-400">(configured)</span>}
            </div>
          )}

          {/* Model picker — switch which model llama-server loads */}
          {models.length > 1 && (
            <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs uppercase tracking-wide text-slate-400">Model</span>
                {switchingTo && <span className="text-xs text-slate-500">restarting…</span>}
              </div>
              <div className="flex flex-col gap-2">
                {models.map((m) => {
                  const isActive = m.key === active;
                  return (
                    <button
                      key={m.key}
                      onClick={() => switchModel(m.key)}
                      disabled={!m.exists || switchingTo !== null || isActive}
                      title={m.exists ? m.file : 'model file not found'}
                      className={`
                        flex items-center justify-between gap-2 px-4 py-2 rounded-lg border text-sm text-left transition-colors
                        ${isActive
                          ? 'border-green-500 bg-green-50 text-green-800'
                          : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}
                        ${(!m.exists || (switchingTo && !isActive)) ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      <span className="font-medium">{m.key}</span>
                      <span className="flex items-center gap-2">
                        {switchingTo === m.key && <Spinner />}
                        {isActive && <span className="text-xs">● active</span>}
                        {!m.exists && <span className="text-xs text-red-500">missing</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Switching restarts llama-server; the new model takes a minute or two to load.
              </p>
            </div>
          )}

          {/* GPU mode toggle — Qwen and ComfyUI share one iGPU */}
          <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs uppercase tracking-wide text-slate-400">GPU mode</span>
              <a href="http://localhost:8188" target="_blank" rel="noreferrer"
                 className="text-xs text-blue-600 hover:underline">
                ComfyUI {comfyui ? '●' : '○'} ↗
              </a>
            </div>
            <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm font-medium">
              <button
                onClick={() => switchMode('llm')}
                disabled={switching !== null}
                className={`px-4 py-1.5 transition-colors ${gpuMode === 'llm' ? 'bg-green-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'} ${switching ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {switching === 'llm' ? 'Switching…' : 'LLM (Qwen)'}
              </button>
              <button
                onClick={() => switchMode('image')}
                disabled={switching !== null}
                className={`px-4 py-1.5 transition-colors border-l border-slate-300 ${gpuMode === 'image' ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'} ${switching ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {switching === 'image' ? 'Switching…' : 'Image (ComfyUI)'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mt-2">
              {gpuMode === 'image'
                ? 'Qwen stopped — iGPU free for ComfyUI image generation.'
                : 'Qwen has the iGPU. Switch to Image to free it for ComfyUI (one at a time).'}
            </p>
          </div>

          {/* Description */}
          <p className="text-sm text-slate-600 mb-5 leading-relaxed">
            {running ? (
              <>
                Server is running on port <span className="font-mono text-slate-700">8080</span> &mdash;{' '}
                <span className="text-slate-500">~40 GB RAM in use by the LLM</span>
              </>
            ) : (
              <>
                Free up ~40 GB RAM for gaming &mdash;{' '}
                <span className="text-slate-500">LLM will not be accessible on port 8080</span>
              </>
            )}
          </p>

          {/* Error from polling */}
          {showPollingError && (
            <div className="mb-4 bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-start gap-2.5">
              <svg className="w-4 h-4 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {/* Action button */}
          {isProcessing ? (
            <button
              disabled
              className={`
                w-full flex items-center justify-center gap-2.5
                py-3 px-5 rounded-lg text-sm font-semibold
                transition-all duration-200
                ${isStopAction
                  ? 'bg-red-600 hover:bg-red-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
                }
              `}
              aria-busy="true"
            >
              <Spinner />
              {isStopAction ? 'Stopping server...' : 'Starting server...'}
            </button>
          ) : (
            <button
              onClick={() => handleAction(running ? 'stop' : 'start')}
              className={`
                w-full flex items-center justify-center gap-2.5
                py-3 px-5 rounded-lg text-sm font-semibold
                transition-all duration-200
                ${running
                  ? 'bg-red-600 hover:bg-red-700 text-white shadow-sm hover:shadow'
                  : 'bg-green-600 hover:bg-green-700 text-white shadow-sm hover:shadow'
                }
              `}
            >
              {running && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              )}
              {!running && (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {running ? 'Stop LLM Server' : 'Start LLM Server'}
            </button>
          )}

          {/* Success/error message */}
          {message && (
            <div
              className={`
                mt-4 px-4 py-3 rounded-lg text-sm flex items-start gap-2.5 animate-fade-in-up
                ${msgType === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}
              `}
            >
              {msgType === 'success' ? (
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              )}
              {message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

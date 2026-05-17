import data from '../data/repo';

export default function Troubleshooting() {
  const solutions = {
    "Service not running": "Check systemd status: `systemctl --user status llama-server`. Verify toolbox exists: `toolbox list`. Check container logs: `podman logs llama-vulkan-radv`.",
    "Can't reach from LAN": "Verify firewall: `firewall-cmd --list-ports`. Check mDNS: `avahi-resolve -n framework.local`. Ensure host is bound to 0.0.0.0, not 127.0.0.1.",
    "OpenCode context exceeded": "Increase CONTEXT in config.sh. Per-slot budget = CONTEXT / N_PARALLEL. Each slot needs its own token budget.",
    "Empty responses": "max_tokens may be too low — reasoning budget is 2048. Send at least 3000+ total tokens in your request.",
    "GPU not actually being used": "Run `amdgpu_top` during inference. GFX should spike to 80%+, SCLK to 2900 MHz. If not, check `--ngl 999` flag.",
    "GTT memory wrong / too small": "Run `dmesg | grep GTT` — should show 126976M ready. If not, kernel params didn't apply; re-run 01-kernel-params.sh and reboot.",
    "Tool calls not parsed by agent": "Run `scripts/test-tools.sh` locally. If it passes, your agent client may expect a different tool call format — compare the JSON structure.",
  };

  return (
    <section id="troubleshooting" className="py-20 px-4 md:px-8 lg:px-16">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-2 tracking-tight text-slate-900">Troubleshooting</h2>
        <p className="text-slate-600 mb-10 text-base">Common issues, diagnostics, and fixes</p>

        <div className="space-y-3">
          {data.troubleshooting.map((item, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 text-sm mb-3">{item.symptom}</h3>
                  <div className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span className="text-blue-600 font-mono text-xs shrink-0 mt-0.5">$ check</span>
                      <code className="text-xs font-mono text-slate-700 bg-slate-100 px-2 py-1 rounded">{item.check}</code>
                    </div>
                    <div className="flex items-start gap-2">
                      <span className="text-green-600 font-mono text-xs shrink-0 mt-0.5">&#10003; fix</span>
                      <p className="text-sm text-slate-600 leading-relaxed">{solutions[item.symptom] || item.check}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

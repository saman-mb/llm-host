import { useState } from 'react';
import data from '../data/repo';

export default function Architecture() {
  const [hoveredLayer, setHoveredLayer] = useState(null);

  return (
    <section id="architecture" className="min-h-screen py-20 px-4 md:px-8 lg:px-16">
      <div className="max-w-6xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold mb-2">Architecture</h2>
        <p className="text-slate-500 mb-12 text-lg">End-to-end flow from request to GPU inference</p>

        <div className="grid md:grid-cols-5 gap-0">
          {data.nav.slice(0, 5).map((item, i) => (
            <div
              key={item.id}
              className={`flex flex-col items-center text-center p-6 border-b md:border-b-0 md:border-r border-slate-200 ${i === 0 ? '' : ''}`}
              onMouseEnter={() => setHoveredLayer(i)}
              onMouseLeave={() => setHoveredLayer(null)}
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg mb-4 transition-colors ${hoveredLayer === i ? 'bg-blue-500' : 'bg-slate-300'}`}>
                {i + 1}
              </div>
              <h3 className="font-semibold text-slate-900 mb-2">{item.label}</h3>
              <p className="text-sm text-slate-500">{data.layers[i]?.summary}</p>
            </div>
          ))}
        </div>

        <div className="mt-12 grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3">Request Flow</h3>
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="text-blue-500 font-mono text-sm">01</span>
                <p className="text-slate-600 text-sm">Agent sends OpenAI-compatible request to 0.0.0.0:8080/v1/chat/completions</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-500 font-mono text-sm">02</span>
                <p className="text-slate-600 text-sm">systemd → toolbox run → llama-server picks up request slot</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-500 font-mono text-sm">03</span>
                <p className="text-slate-600 text-sm">llama.cpp offloads layers to GPU via Vulkan/RADV (ngl 999)</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-500 font-mono text-sm">04</span>
                <p className="text-slate-600 text-sm">~3B active params per token on Radeon 8060S → ~80 tok/s</p>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-blue-500 font-mono text-sm">05</span>
                <p className="text-slate-600 text-sm">Response streamed back to agent over HTTP</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
            <h3 className="font-semibold text-slate-900 mb-3">Key Decisions</h3>
            <div className="space-y-3">
              {data.notThis.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-red-400 text-sm mt-0.5">✕</span>
                  <p className="text-slate-600 text-sm">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

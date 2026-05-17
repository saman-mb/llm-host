import { useState } from 'react';
import MermaidDiagram from './MermaidDiagram';
import data from '../data/repo';

export default function Architecture() {
  return (
    <section id="architecture" className="py-20 px-4 md:px-8 lg:px-16 bg-slate-50">
      <div className="max-w-5xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-2 tracking-tight text-slate-900">Architecture</h2>
        <p className="text-slate-600 mb-10 text-base">End-to-end flow from request to GPU inference</p>

        <MermaidDiagram />

        <div className="mt-10 grid md:grid-cols-2 gap-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <h3 className="text-base font-semibold text-slate-900 mb-4">Request Flow</h3>
            <div className="space-y-3">
              {[
                "Agent sends OpenAI-compatible request to 0.0.0.0:8080/v1/chat/completions",
                "systemd → toolbox run → llama-server picks up request slot",
                "llama.cpp offloads layers to GPU via Vulkan/RADV (ngl 999)",
                "~3B active params per token on Radeon 8060S → ~80 tok/s",
                "Response streamed back to agent over HTTP",
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-blue-600 font-mono text-sm mt-0.5 shrink-0">{String(i + 1).padStart(2, '0')}</span>
                  <p className="text-slate-600 text-sm leading-relaxed">{step}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
            <h3 className="text-base font-semibold text-slate-900 mb-4">Key Decisions</h3>
            <div className="space-y-3">
              {data.notThis.map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <span className="text-red-500 text-sm mt-0.5 shrink-0">&#10005;</span>
                  <p className="text-slate-600 text-sm leading-relaxed">{item}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

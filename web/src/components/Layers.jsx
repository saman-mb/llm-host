import { useState } from 'react';
import data from '../data/repo';

export default function Layers() {
  const [expanded, setExpanded] = useState(0);

  return (
    <section id="layers" className="min-h-screen py-20 px-4 md:px-8 lg:px-16 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold mb-2">Layers</h2>
        <p className="text-slate-500 mb-12 text-lg">Hardware → Kernel → Container → Engine → GPU → Model → Service → Network → Client</p>

        <div className="space-y-4">
          {data.layers.map((layer, i) => (
            <div key={layer.num} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <button
                className="w-full flex items-center gap-4 p-6 text-left hover:bg-slate-50 transition-colors"
                onClick={() => setExpanded(expanded === i ? -1 : i)}
              >
                <span className="w-10 h-10 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {layer.num}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-slate-900">{layer.title}</h3>
                  <p className="text-slate-500 text-sm mt-1 truncate">{layer.summary}</p>
                </div>
                <svg className={`w-5 h-5 text-slate-400 transition-transform ${expanded === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expanded === i && (
                <div className="px-6 pb-6 border-t border-slate-100 pt-4">
                  <ul className="space-y-2 mb-4">
                    {layer.details.map((detail, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-slate-600">
                        <span className="text-blue-500 mt-1">·</span>
                        {detail}
                      </li>
                    ))}
                  </ul>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-blue-800 text-sm">{layer.callout}</p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

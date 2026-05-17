import { useState } from 'react';
import data from '../data/repo';

export default function Layers() {
  const [expanded, setExpanded] = useState(0);

  return (
    <section id="layers" className="py-20 px-4 md:px-8 lg:px-16">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-2 tracking-tight text-slate-900">Layers</h2>
        <p className="text-slate-600 mb-10 text-base">Hardware &#8594; Kernel &#8594; Container &#8594; Engine &#8594; GPU &#8594; Model &#8594; Service &#8594; Network &#8594; Client</p>

        <div className="space-y-3">
          {data.layers.map((layer, i) => (
            <div key={layer.num} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
              <button
                className="w-full flex items-center gap-4 p-5 text-left hover:bg-slate-50 transition-colors"
                onClick={() => setExpanded(expanded === i ? -1 : i)}
                aria-expanded={expanded === i}
                aria-controls={`layer-${layer.num}`}
              >
                <span className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 transition-colors ${expanded === i ? 'bg-blue-500 text-white' : 'bg-blue-500/10 text-blue-600'}`}>
                  {layer.num}
                </span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900">{layer.title}</h3>
                  <p className="text-slate-600 text-xs mt-0.5 truncate">{layer.summary}</p>
                </div>
                <svg className={`w-4 h-4 text-slate-400 transition-transform duration-200 shrink-0 ${expanded === i ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expanded === i && (
                <div id={`layer-${layer.num}`} className="px-5 pb-5 border-t border-slate-100 pt-4 animate-fade-in-up">
                  <ul className="space-y-2 mb-4">
                    {layer.details.map((detail, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-slate-600 leading-relaxed">
                        <span className="text-blue-500 mt-1 shrink-0">&#8226;</span>
                        {detail}
                      </li>
                    ))}
                  </ul>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-blue-800 text-sm leading-relaxed">{layer.callout}</p>
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

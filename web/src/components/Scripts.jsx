import data from '../data/repo';
import CopyButton from './CopyButton';

export default function Scripts() {
  const icons = {
    status: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />,
    logs: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />,
    restart: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />,
    test: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />,
    download: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />,
    benchmark: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />,
  };

  return (
    <section id="scripts" className="py-20 px-4 md:px-8 lg:px-16 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-2 tracking-tight text-slate-900">Scripts</h2>
        <p className="text-slate-600 mb-10 text-base">CLI tools for daily operations</p>

        <div className="space-y-3">
          {data.scripts.map((script, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="md:w-44 shrink-0">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                      <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        {icons[script.name.replace('.sh', '').toLowerCase()] || icons.logs}
                      </svg>
                    </div>
                    <code className="text-sm font-mono font-semibold text-slate-900">{script.name}</code>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-slate-600 text-sm mb-3 leading-relaxed">{script.desc}</p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5">
                    <span className="text-slate-400 text-xs uppercase tracking-wide shrink-0">Usage</span>
                    <div className="relative flex-1">
                      <code className="text-xs font-mono bg-slate-100 px-2 py-1 rounded block break-all">{script.usage}</code>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 mt-1.5">
                    <span className="text-slate-400 text-xs uppercase tracking-wide shrink-0">Example</span>
                    <div className="relative flex-1">
                      <code className="text-xs font-mono bg-slate-100 px-2 py-1 rounded block break-all">{script.example}</code>
                      <div className="absolute top-1 right-1">
                        <CopyButton text={script.example} className="bg-white hover:bg-slate-50 rounded px-1.5 py-0.5 text-slate-400" />
                      </div>
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

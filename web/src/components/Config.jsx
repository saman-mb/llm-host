import data from '../data/repo';
import CopyButton from './CopyButton';

export default function Config() {
  return (
    <section id="config" className="py-20 px-4 md:px-8 lg:px-16">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-2 tracking-tight text-slate-900">Configuration</h2>
        <p className="text-slate-600 mb-10 text-base">{data.config.description}</p>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden transition-all duration-200 hover:shadow-md">
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
            <code className="text-sm font-mono text-slate-700">config.sh</code>
          </div>

          <div className="divide-y divide-slate-100">
            {data.config.vars.map((v, i) => (
              <div key={i} className="flex flex-col sm:flex-row sm:items-center gap-2 px-5 py-4">
                <div className="sm:w-36 shrink-0">
                  <span className="font-mono text-sm font-semibold text-blue-600">{v.name}</span>
                </div>
                <div className="flex-1 relative">
                  <code className="text-sm font-mono text-slate-800 bg-slate-50 px-2.5 py-1 rounded block break-all">{v.value}</code>
                  {v.value.length > 30 && (
                    <div className="absolute top-1 right-1">
                      <CopyButton text={v.value} className="bg-slate-100 hover:bg-slate-200 rounded px-1.5 py-0.5" />
                    </div>
                  )}
                </div>
                <div className="sm:w-56 sm:text-right">
                  <span className="text-sm text-slate-600">{v.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            <p className="text-amber-800 text-sm leading-relaxed">
              <strong>After editing config.sh</strong>, restart with <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-amber-900">scripts/restart.sh</code>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

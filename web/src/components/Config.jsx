import data from '../data/repo';

export default function Config() {
  return (
    <section id="config" className="min-h-screen py-20 px-4 md:px-8 lg:px-16">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold mb-2">Configuration</h2>
        <p className="text-slate-500 mb-12 text-lg">{data.config.description}</p>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
            <code className="text-sm font-mono text-slate-700">config.sh</code>
          </div>
          <div className="divide-y divide-slate-100">
            {data.config.vars.map((v, i) => (
              <div key={i} className="flex flex-col md:flex-row md:items-center gap-2 p-6">
                <div className="md:w-36 shrink-0">
                  <span className="font-mono text-sm font-semibold text-blue-600">{v.name}</span>
                </div>
                <div className="md:w-auto flex-1">
                  <code className="text-sm font-mono text-slate-900 bg-slate-50 px-2 py-1 rounded">{v.value}</code>
                </div>
                <div className="md:w-64 md:text-right">
                  <span className="text-sm text-slate-500">{v.desc}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-xl p-6">
          <p className="text-amber-800 text-sm">
            <strong>Note:</strong> After editing config.sh, restart with <code className="font-mono bg-amber-100 px-1.5 py-0.5 rounded text-amber-900">scripts/restart.sh</code>
          </p>
        </div>
      </div>
    </section>
  );
}

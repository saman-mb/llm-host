import data from '../data/repo';

export default function Scripts() {
  return (
    <section id="scripts" className="min-h-screen py-20 px-4 md:px-8 lg:px-16 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold mb-2">Scripts</h2>
        <p className="text-slate-500 mb-12 text-lg">CLI tools for daily operations</p>

        <div className="space-y-4">
          {data.scripts.map((script, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="md:w-48 shrink-0">
                  <code className="text-sm font-mono font-semibold text-slate-900 bg-blue-50 px-3 py-1.5 rounded-lg">
                    {script.name}
                  </code>
                </div>
                <div className="flex-1">
                  <p className="text-slate-600 text-sm mb-3">{script.desc}</p>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <span className="text-slate-400 text-xs uppercase tracking-wide">Usage</span>
                    <code className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">{script.usage}</code>
                  </div>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 mt-2">
                    <span className="text-slate-400 text-xs uppercase tracking-wide">Example</span>
                    <code className="text-xs font-mono bg-slate-100 px-2 py-1 rounded text-slate-700">{script.example}</code>
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

import data from '../data/repo';

export default function Troubleshooting() {
  return (
    <section id="troubleshooting" className="min-h-screen py-20 px-4 md:px-8 lg:px-16 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold mb-2">Troubleshooting</h2>
        <p className="text-slate-500 mb-12 text-lg">Common issues and how to diagnose them</p>

        <div className="space-y-4">
          {data.troubleshooting.map((item, i) => (
            <div key={i} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-start gap-4">
                <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center shrink-0 mt-0.5">
                  <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-slate-900 mb-2">{item.symptom}</h3>
                  <div className="flex items-start gap-2">
                    <span className="text-blue-500 font-mono text-sm mt-0.5 shrink-0">$</span>
                    <code className="text-sm font-mono text-slate-600 bg-slate-50 px-2 py-1 rounded">{item.check}</code>
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

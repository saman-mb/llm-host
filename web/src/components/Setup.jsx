import data from '../data/repo';

export default function Setup() {
  return (
    <section id="setup" className="min-h-screen py-20 px-4 md:px-8 lg:px-16">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold mb-2">Setup</h2>
        <p className="text-slate-500 mb-12 text-lg">Step-by-step installation</p>

        <div className="space-y-0">
          {data.setup.map((step, i) => (
            <div key={step.step} className="flex gap-4">
              <div className="flex flex-col items-center shrink-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white ${step.reboot ? 'bg-amber-500' : 'bg-blue-500'}`}>
                  {step.step}
                </div>
                {i < data.setup.length - 1 && (
                  <div className="w-0.5 h-full min-h-[48px] bg-slate-200 mt-2" />
                )}
              </div>
              <div className="pb-8">
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-semibold text-slate-900">{step.name}</h3>
                  {step.reboot && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Requires reboot</span>
                  )}
                </div>
                <p className="text-slate-600 text-sm mb-3">{step.desc}</p>
                <code className="text-sm font-mono bg-slate-900 text-green-400 px-3 py-2 rounded-lg block">
                  $ {step.cmd}
                </code>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

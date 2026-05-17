import data from '../data/repo';
import CopyButton from './CopyButton';

export default function Setup() {
  const phase1 = data.setup.filter(s => s.step <= 3);
  const phase2 = data.setup.filter(s => s.step > 3);

  return (
    <section id="setup" className="py-20 px-4 md:px-8 lg:px-16 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-2 tracking-tight text-slate-900">Setup</h2>
        <p className="text-slate-600 mb-10 text-base">Step-by-step installation guide</p>

        {[
          { label: 'Phase 1: System Preparation', steps: phase1, requiresReboot: true },
          { label: 'Phase 2: Service Installation', steps: phase2, requiresReboot: false },
        ].map((phase, pi) => (
          <div key={pi} className="mb-10 last:mb-0">
            <h3 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-6">{phase.label}</h3>
            <div className="space-y-0">
              {phase.steps.map((step, i) => {
                const items = phase1.concat(phase2);
                const idx = items.indexOf(step);
                return (
                  <div key={step.step} className="flex gap-4">
                    <div className="flex flex-col items-center shrink-0">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm text-white ${step.reboot ? 'bg-amber-500' : 'bg-blue-500'}`}>
                        {step.step}
                      </div>
                      {idx < items.length - 1 && (
                        <div className="w-0.5 min-h-[48px] bg-slate-200 mt-2" />
                      )}
                    </div>
                    <div className="pb-6">
                      <div className="flex items-center gap-3 mb-2">
                        <h4 className="font-semibold text-slate-900 text-sm">{step.name}</h4>
                        {step.reboot && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">Requires reboot</span>
                        )}
                      </div>
                      <p className="text-slate-600 text-sm mb-3">{step.desc}</p>
                      <div className="relative">
                        <code className="text-xs font-mono bg-slate-900 text-green-400 px-3 py-2 rounded-lg block">
                          $ {step.cmd}
                        </code>
                        <div className="absolute top-2 right-2">
                          <CopyButton text={step.cmd} className="bg-slate-800/80 hover:bg-slate-700 rounded px-2 py-1" />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

import data from '../data/repo';
import LLMControl from './LLMControl';

export default function Hero() {
  return (
    <section id="overview" className="py-24 md:py-32 px-4 md:px-8 lg:px-16">
      <div className="max-w-5xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-600 px-4 py-1.5 rounded-full text-sm font-medium mb-8">
          <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse motion-safe:animate-pulse" />
          AMD Strix Halo &#183; 125 GB Unified RAM
        </div>
        <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-slate-900 tracking-tight">
          {data.repo.name}
        </h1>
        <p className="text-lg md:text-xl text-slate-600 mb-12 max-w-3xl mx-auto leading-relaxed">
          {data.repo.description}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 max-w-2xl mx-auto">
          {data.stats.map(stat => (
            <div key={stat.label} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5">
              <div className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">{stat.value}</div>
              <div className="text-slate-500 text-xs mt-1 uppercase tracking-wide">{stat.label}</div>
            </div>
          ))}
        </div>
        <LLMControl />
      </div>
    </section>
  );
}

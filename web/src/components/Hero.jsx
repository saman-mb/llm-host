import data from '../data/repo';

export default function Hero() {
  return (
    <section id="overview" className="min-h-screen flex items-center justify-center px-4 md:px-8 lg:px-16">
      <div className="max-w-4xl mx-auto text-center">
        <div className="inline-flex items-center gap-2 bg-blue-500/10 text-blue-600 px-4 py-2 rounded-full text-sm font-medium mb-8">
          <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></span>
          AMD Strix Halo · 125 GB Unified RAM
        </div>
        <h1 className="text-4xl md:text-6xl font-bold mb-6 text-slate-900">
          {data.repo.name}
        </h1>
        <p className="text-xl md:text-2xl text-slate-600 mb-12 max-w-3xl mx-auto leading-relaxed">
          {data.repo.description}
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-2xl mx-auto">
          {data.stats.map(stat => (
            <div key={stat.label} className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm">
              <div className="text-2xl md:text-3xl font-bold text-slate-900">{stat.value}</div>
              <div className="text-slate-500 text-sm mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

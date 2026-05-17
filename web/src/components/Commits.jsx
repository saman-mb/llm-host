import data from '../data/repo';

export default function Commits() {
  return (
    <section id="commits" className="min-h-screen py-20 px-4 md:px-8 lg:px-16 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold mb-2">Commits</h2>
        <p className="text-slate-500 mb-12 text-lg">Recent activity</p>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="divide-y divide-slate-100">
            {data.commits.map((commit, i) => (
              <div key={i} className="flex items-center gap-4 p-4 md:px-6">
                <span className="font-mono text-xs text-blue-500 bg-blue-50 px-2 py-1 rounded shrink-0">
                  {commit.hash.slice(0, 7)}
                </span>
                <span className="text-sm text-slate-500 shrink-0 w-36 text-right hidden md:block">{commit.date}</span>
                <p className="text-sm text-slate-700">{commit.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

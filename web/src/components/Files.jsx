import data from '../data/repo';

export default function Files() {
  return (
    <section id="files" className="min-h-screen py-20 px-4 md:px-8 lg:px-16">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-3xl md:text-4xl font-bold mb-2">Files</h2>
        <p className="text-slate-500 mb-12 text-lg">{data.repo.files} files in the repository</p>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
            <code className="text-sm font-mono text-slate-600">$ tree -L 2</code>
          </div>
          <div className="p-6">
            <div className="space-y-1">
              {data.fileTree.map((file, i) => {
                const parts = file.path.split('/');
                const isDir = parts.length > 1;
                const depth = isDir ? 1 : 0;

                return (
                  <div key={i} className="flex items-center gap-3" style={{ paddingLeft: `${depth * 24}px` }}>
                    {isDir ? (
                      <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    )}
                    <span className="font-mono text-sm text-slate-700">{file.path}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

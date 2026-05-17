import { useState } from 'react';
import data from '../data/repo';

export default function Repository() {
  const [tab, setTab] = useState('commits');

  return (
    <section id="repository" className="py-20 px-4 md:px-8 lg:px-16 bg-slate-50">
      <div className="max-w-4xl mx-auto">
        <h2 className="text-2xl md:text-3xl font-bold mb-2 tracking-tight text-slate-900">Repository</h2>
        <p className="text-slate-600 mb-8 text-base">{data.repo.files} files &#183; {data.repo.commits} commits &#183; {data.repo.branch}</p>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="flex border-b border-slate-200">
            <button
              onClick={() => setTab('commits')}
              className={`px-5 py-3 text-sm font-medium transition-colors ${tab === 'commits' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Recent Commits
            </button>
            <button
              onClick={() => setTab('files')}
              className={`px-5 py-3 text-sm font-medium transition-colors ${tab === 'files' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-slate-500 hover:text-slate-700'}`}
            >
              File Tree
            </button>
          </div>

          {tab === 'commits' && (
            <div className="divide-y divide-slate-100">
              {data.commits.map((commit, i) => (
                <div key={i} className="flex items-center gap-4 px-5 py-3">
                  <span className="font-mono text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded shrink-0">
                    {commit.hash.slice(0, 7)}
                  </span>
                  <span className="text-xs text-slate-500 shrink-0 w-32 text-right hidden sm:block">{commit.date}</span>
                  <p className="text-sm text-slate-700">{commit.message}</p>
                </div>
              ))}
            </div>
          )}

          {tab === 'files' && (
            <div className="p-5">
              <div className="space-y-1">
                {data.fileTree.map((file, i) => {
                  const parts = file.path.split('/');
                  const isDir = parts.length > 1;
                  const depth = isDir ? 1 : 0;
                  return (
                    <div key={i} className="flex items-center gap-3" style={{ paddingLeft: `${depth * 20}px` }}>
                      {isDir ? (
                        <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4 text-slate-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      )}
                      <span className="font-mono text-sm text-slate-600">{file.path}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

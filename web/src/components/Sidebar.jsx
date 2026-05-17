import { useState } from 'react';
import data from '../data/repo';

export default function Sidebar({ activeSection, setActiveSection }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className="fixed top-4 left-4 z-50 md:hidden bg-slate-800 text-white p-2.5 rounded-lg shadow-lg"
        onClick={() => setOpen(!open)}
        aria-label="Toggle navigation"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={open ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
        </svg>
      </button>

      <aside className={`fixed top-0 left-0 h-full w-72 bg-gradient-to-b from-slate-900 to-slate-950 text-white z-40 border-r border-slate-700/30 transform transition-transform duration-300 ${open ? 'translate-x-0' : '-translate-x-full'} md:translate-x-0`}>
        <div className="p-6 border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-sm shadow-lg shadow-blue-500/20">ll</div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">{data.repo.name}</h1>
              <p className="text-slate-400 text-xs mt-0.5">Local LLM Serving</p>
            </div>
          </div>
        </div>
        <nav className="p-4 mt-2" role="navigation" aria-label="Main navigation">
          {data.nav.map(item => (
            <a
              key={item.id}
              href={`#${item.id}`}
              onClick={(e) => { e.preventDefault(); setActiveSection(item.id); setOpen(false); document.getElementById(item.id)?.scrollIntoView({ behavior: 'smooth' }); }}
              className={`block px-3 py-2 rounded-lg text-sm transition-all duration-200 ${activeSection === item.id ? 'bg-blue-500/20 text-blue-400 font-medium' : 'text-slate-300 hover:bg-slate-800/70 hover:text-white'}`}
              aria-current={activeSection === item.id ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-slate-700/50">
          <p className="text-slate-400 text-xs">{data.repo.files} files &#183; {data.repo.commits} commits</p>
        </div>
      </aside>

      {open && <div className="fixed inset-0 bg-black/50 z-30 md:hidden" onClick={() => setOpen(false)} />}
    </>
  );
}

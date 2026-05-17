export default function Footer() {
  return (
    <footer className="py-12 px-4 md:px-8 lg:px-16 border-t border-slate-200">
      <div className="max-w-6xl mx-auto text-center">
        <p className="text-slate-500 text-sm leading-relaxed">
          Built with React + Tailwind CSS + Mermaid.js &#183; Powered by llama.cpp on AMD Strix Halo
        </p>
        <p className="text-slate-400 text-xs mt-3">
          Updated May 17, 2026 &#183; {new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())}
        </p>
      </div>
    </footer>
  );
}

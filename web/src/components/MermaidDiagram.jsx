import { useEffect, useRef, useState, useCallback } from 'react';
import { mermaidDiagram } from '../data/mermaid-diagram';

export default function MermaidDiagram() {
  const [svg, setSvg] = useState('');
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const initialized = useRef(false);

  const renderDiagram = useCallback(async () => {
    if (initialized.current) return;
    initialized.current = true;

    try {
      const mermaidModule = await import('mermaid');
      const mermaid = mermaidModule.default || mermaidModule;

      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        theme: 'dark',
        themeVariables: {
          primaryColor: '#1e293b',
          primaryBorderColor: '#475569',
          primaryTextColor: '#f1f5f9',
          lineColor: '#64748b',
          lineColor2: '#94a3b8',
          subgraphBg: 'rgba(30, 41, 59, 0.5)',
          subgraphBorder: '#334155',
          subgraphFontSize: '13px',
          subgraphFontWeight: '600',
          fontSize: '12px',
          fontFamily: '"Inter", system-ui, sans-serif',
          textAlignment: 'left',
          nodePadding: '10px 14px',
          nodeBorderWidth: '1.5px',
          nodeBorderRadius: '8px',
          backgroundColor: '#0f172a',
          clusterBkg: '#1e293b',
          clusterEdgeColor: '#334155',
          clusterTextColor: '#cbd5e1',
          flowchartBg: '#0f172a',
          flowchartCurve: 'basis',
          flowchartDiagramPadding: '10px',
          lineMarkerR: '8px',
        },
        flowchart: {
          htmlLabels: true,
          curve: 'basis',
          nodeSpacing: 50,
          rankSpacing: 70,
          padding: 16,
        },
      });

      const { svg: renderedSvg } = await mermaid.render(
        'llm-host-arch-' + Date.now(),
        mermaidDiagram
      );
      setSvg(renderedSvg);
    } catch (err) {
      setError(err.message || 'Failed to render diagram');
    }
  }, []);

  useEffect(() => {
    renderDiagram();
  }, [renderDiagram]);

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-6">
        <div className="flex items-center gap-3 mb-2">
          <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="font-medium text-red-300">Diagram render error</p>
        </div>
        <pre className="mt-2 text-xs font-mono text-red-400/70 bg-red-950/30 p-3 rounded-lg overflow-auto">{error}</pre>
      </div>
    );
  }

  const content = (
    <div
      className="mermaid-diagram flex items-center justify-center"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );

  return (
    <div className={`rounded-xl border border-slate-700/50 overflow-hidden bg-slate-950 transition-all duration-300 ${expanded ? 'fixed inset-4 z-50 m-auto max-w-none rounded-2xl' : ''}`}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/50 bg-slate-900/50">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="ml-3 text-xs font-mono text-slate-400">architecture.mmd</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-slate-400 hover:text-white transition-colors px-2 py-1 rounded hover:bg-slate-700/50"
            aria-label={expanded ? 'Collapse diagram' : 'Expand diagram'}
          >
            {expanded ? 'Collapse' : 'Fullscreen'}
          </button>
          {expanded && (
            <button
              onClick={() => setExpanded(false)}
              className="text-xs text-slate-400 hover:text-white transition-colors p-1 rounded hover:bg-slate-700/50"
              aria-label="Close fullscreen"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
      <div className={`p-4 ${expanded ? 'h-[calc(100vh-120px)]' : 'max-h-[600px]'}`}>
        {!svg && (
          <div className="h-64 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
              <span className="text-xs text-slate-400">Rendering diagram...</span>
            </div>
          </div>
        )}
        <div className={`${!svg ? 'hidden' : ''} ${expanded ? 'h-full overflow-auto' : 'overflow-auto'} mermaid-content`}>
          {expanded ? (
            <div className="flex h-full items-center justify-center p-4">
              {content}
            </div>
          ) : (
            content
          )}
        </div>
      </div>
    </div>
  );
}

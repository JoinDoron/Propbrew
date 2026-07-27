'use client';

import { useRef, useState } from 'react';
import { Check, FileText, Search, Sparkles } from 'lucide-react';
import { searchDocuments, type SearchResult } from '@/server/actions/documents';
import { DOC_TYPE_LABEL } from '@/domain/documents';
import type { DocView } from './types';

const SUGGESTIONS = ['fire safety certificate', 'lift maintenance contract', 'insurance policy number', 'service charge'];
type Phase = 'idle' | 'thinking' | 'done';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** AI-S-03 semantic search. The scorer is deterministic and instant, so the
 *  assistant feel is choreographed: an intent-aware thinking trace, then ranked
 *  hits that show WHICH extracted field matched. */
export function DocSearchBox({ documents, onOpen }: { documents: DocView[]; onOpen: (id: string) => void }) {
  const [q, setQ] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [thoughts, setThoughts] = useState<string[]>([]);
  const [active, setActive] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);
  const runRef = useRef(0);

  const byId = new Map(documents.map((d) => [d.id, d]));
  const busy = phase === 'thinking';

  async function run(query: string) {
    const text = query.trim();
    if (!text || busy) return;
    const run = ++runRef.current;
    const alive = () => runRef.current === run;
    setQ(text); setPhase('thinking'); setThoughts([]); setActive(''); setResult(null);

    const resP = searchDocuments(text);
    const steps = ['Reading your query…', 'Scanning the document index…', 'Extracting matching fields…', 'Ranking by relevance…'];
    const done: string[] = [];
    for (const s of steps) {
      if (!alive()) return;
      setActive(s);
      await sleep(420 + Math.floor(Math.random() * 320));
      if (!alive()) return;
      done.push(s); setThoughts([...done]); setActive('');
    }
    const res = await resP;
    if (!alive()) return;
    setResult(res); setPhase('done');
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-[18px] shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg bg-primary-weak text-primary flex items-center justify-center flex-none"><Sparkles size={15} /></span>
        <div>
          <div className="text-[14px] font-semibold leading-tight">Search your documents</div>
          <div className="text-[11.5px] text-text-3">AI-S-03 · semantic search over extracted fields, scoped to your estates</div>
        </div>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); run(q); }} className="flex items-center gap-2 h-11 px-3 rounded-xl border border-border bg-surface-2 focus-within:border-primary transition-colors">
        <Search size={16} className="text-text-3 flex-none" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. what's our fire cert number and when does it expire?" className="flex-1 bg-transparent outline-none text-[13.5px]" aria-label="Search documents" />
        <button type="submit" disabled={busy} className="h-8 px-3 rounded-lg bg-primary text-white text-[12.5px] font-medium disabled:opacity-60 flex-none inline-flex items-center gap-1.5">{busy ? <><Dots /> Searching</> : 'Search'}</button>
      </form>

      {phase === 'idle' && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {SUGGESTIONS.map((s) => <button key={s} onClick={() => run(s)} className="text-[11.5px] text-text-2 border border-border-2 rounded-full px-2.5 h-7 hover:bg-surface-2 hover:border-primary transition-colors">{s}</button>)}
        </div>
      )}

      {(phase === 'thinking' || (phase === 'done' && thoughts.length > 0)) && (
        <div className="mt-3.5 flex flex-col gap-1.5">
          {thoughts.map((t, i) => <div key={i} className="flex items-center gap-2 text-[12px] text-text-3 animate-fade"><Check size={12} className="text-success flex-none" />{t}</div>)}
          {active && <div className="flex items-center gap-2 text-[12.5px] text-text-2"><Dots />{active}</div>}
        </div>
      )}

      {phase === 'done' && result && (
        <div className="mt-3 flex flex-col gap-1.5">
          {result.hits.length === 0 ? (
            <div className="text-[13px] text-text-3 py-2">No documents matched. Try a certificate number, an authority, or a keyword.</div>
          ) : (
            <>
              <div className="text-[11.5px] text-text-3">{result.hits.length} match{result.hits.length === 1 ? '' : 'es'} · ranked · grounded in {result.scopeLabel}</div>
              {result.hits.slice(0, 5).map((h) => {
                const d = byId.get(h.docId);
                if (!d) return null;
                return (
                  <button key={h.docId} onClick={() => onOpen(h.docId)} className="flex items-center gap-3 text-left rounded-xl border border-border bg-surface-2 p-2.5 hover:border-primary transition-colors animate-fade">
                    <span className="w-8 h-8 rounded-lg bg-surface flex items-center justify-center flex-none text-text-3"><FileText size={15} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12.5px] font-medium truncate">{d.name}</div>
                      <div className="text-[11px] text-text-3 truncate">{DOC_TYPE_LABEL[d.type]} · matched on <span className="text-primary">{h.matchedOn}</span> — {h.snippet}</div>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Dots() {
  return <span className="inline-flex items-end gap-0.5 h-3">{[0, 1, 2].map((i) => <span key={i} className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: `${i * 130}ms`, animationDuration: '900ms' }} />)}</span>;
}

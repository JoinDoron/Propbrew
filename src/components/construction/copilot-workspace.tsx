'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { Sparkles, Send, Link2, ShieldCheck, Cpu, User } from 'lucide-react';
import { toneVar } from '@/lib/status-tones';

type Source = { label: string; href: string };
type Msg = { role: 'you' | 'copilot'; text: string; sources?: Source[]; source?: string; grounded?: boolean };

export function CopilotWorkspace({ suggestions, canSeeCommercials }: { suggestions: string[]; canSeeCommercials: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setQ(''); setBusy(true);
    setMsgs((m) => [...m, { role: 'you', text: question }, { role: 'copilot', text: '' }]);
    try {
      const res = await fetch('/api/construction/copilot', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question }) });
      const source = res.headers.get('X-Copilot-Source') ?? 'builtin';
      const grounded = res.headers.get('X-Copilot-Grounded') === '1';
      let sources: Source[] = [];
      try { sources = JSON.parse(decodeURIComponent(res.headers.get('X-Copilot-Sources') ?? '[]')); } catch { sources = []; }
      if (!res.ok || !res.body) {
        const t = await res.text();
        setMsgs((m) => [...m.slice(0, -1), { role: 'copilot', text: t || 'Something went wrong.', source, grounded: false }]);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs((m) => [...m.slice(0, -1), { role: 'copilot', text: acc, sources, source, grounded }]);
        endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    } catch {
      setMsgs((m) => [...m.slice(0, -1), { role: 'copilot', text: 'The copilot is unreachable right now.', grounded: false }]);
    } finally {
      setBusy(false);
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#04121a 0%,#082635 55%,#0d3b4f 100%)' }}>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><Sparkles size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70">CONSTRUCTION COPILOT · GROUNDED</div>
            <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-0.5">Ask about the build</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">Answers come from your records with citations — never invented{canSeeCommercials ? '' : ' · commercial figures hidden for your access level'}</div>
          </div>
        </div>
      </div>

      {/* Thread */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="divide-y divide-border max-h-[440px] overflow-y-auto">
          {msgs.length === 0 && (
            <div className="px-4 py-10 text-center">
              <Sparkles size={22} className="mx-auto mb-2" style={{ color: toneVar('progress') }} />
              <div className="text-[13px] font-medium">Ask anything about the projects</div>
              <div className="text-[11.5px] text-text-3 mt-1">Schedule, cost, materials, procurement, workforce or risk — every factual answer cites the record it came from.</div>
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className="px-4 py-3 flex items-start gap-2.5">
              <span className="w-7 h-7 rounded-lg grid place-items-center flex-none mt-0.5" style={{ background: `color-mix(in srgb, ${toneVar(m.role === 'you' ? 'muted' : 'progress')} 14%, transparent)`, color: toneVar(m.role === 'you' ? 'muted' : 'progress') }}>
                {m.role === 'you' ? <User size={14} /> : <Sparkles size={14} />}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] uppercase tracking-wide text-text-3 mb-0.5 flex items-center gap-1.5">
                  {m.role === 'you' ? 'You' : 'Copilot'}
                  {m.role === 'copilot' && m.source && <span className="inline-flex items-center gap-1 text-[9.5px] px-1.5 h-4 rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(m.source === 'llm' ? 'info' : 'muted')} 14%, transparent)`, color: toneVar(m.source === 'llm' ? 'info' : 'muted') }}><Cpu size={9} /> {m.source === 'llm' ? 'streamed' : 'deterministic'}</span>}
                  {m.role === 'copilot' && m.text && m.grounded === false && <span className="text-[9.5px] px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar('warn')} 14%, transparent)`, color: toneVar('warn') }}>no record found</span>}
                </div>
                <div className="text-[13px] text-text-2 leading-relaxed whitespace-pre-wrap">{m.text || <span className="text-text-3">thinking…</span>}</div>
                {m.sources && m.sources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {m.sources.map((s, k) => <Link key={k} href={s.href} className="text-[10.5px] px-2 h-6 inline-flex items-center gap-1 rounded-full border border-border-2 text-text-3 hover:text-primary"><Link2 size={10} /> {s.label}</Link>)}
                  </div>
                )}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="p-3 border-t border-border">
          <form onSubmit={(e) => { e.preventDefault(); ask(q); }} className="flex items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. Which projects are behind schedule?" className="flex-1 h-10 px-3 rounded-xl border border-border-2 bg-surface text-[13px] outline-none focus:border-primary" aria-label="Ask the construction copilot" />
            <button type="submit" disabled={busy || !q.trim()} className="h-10 px-4 rounded-xl bg-primary text-white text-[13px] font-medium disabled:opacity-40 inline-flex items-center gap-1.5"><Send size={14} /> Ask</button>
          </form>
          {suggestions.length > 0 && msgs.length === 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {suggestions.map((s) => <button key={s} onClick={() => ask(s)} className="text-[11.5px] px-2.5 h-7 rounded-full border border-border-2 text-text-2 hover:border-primary">{s}</button>)}
            </div>
          )}
        </div>
      </section>

      <div className="bg-surface border border-border rounded-2xl shadow-card p-4 flex items-start gap-2.5">
        <ShieldCheck size={16} className="mt-0.5 flex-none" style={{ color: toneVar('success') }} />
        <div>
          <div className="text-[12.5px] font-semibold">How this stays honest</div>
          <div className="text-[11.5px] text-text-3 mt-0.5">
            The deterministic engine computes the answer from capability-scoped records first; that result is the only context the language model may write from, so the numbers are identical whether or not an LLM is configured. The copilot never transacts — it can point at a record, not change one.
          </div>
        </div>
      </div>
    </div>
  );
}

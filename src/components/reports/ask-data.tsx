'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Check, Search, Sparkles } from 'lucide-react';
import { askData, type DataAnswer } from '@/server/actions/ask-data';
import { type Tone } from '@/lib/status-tones';

const SUGGESTIONS = [
  'Which estate has the most overdue work orders?',
  'What is the collection rate?',
  'Who is in arrears?',
  'How many open work orders?',
  'SOS response times?',
  'Preventive vs reactive?',
];

type Phase = 'idle' | 'thinking' | 'streaming' | 'done';
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** AI-S-02 — "ask about your data". The engine is deterministic and instant, so
 *  the assistant feel is choreographed on the client: an intent-aware thinking
 *  trace, then a word-by-word streamed answer. Still honours §11.4 — grounded
 *  answer with confidence + sources, computed over the caller's scoped data. */
export function AskData() {
  const [q, setQ] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [thoughts, setThoughts] = useState<string[]>([]);
  const [activeThought, setActiveThought] = useState('');
  const [answer, setAnswer] = useState<DataAnswer | null>(null);
  const [streamed, setStreamed] = useState('');
  const runRef = useRef(0);

  const busy = phase === 'thinking' || phase === 'streaming';

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const run = ++runRef.current;
    const alive = () => runRef.current === run;

    setQ(text);
    setPhase('thinking');
    setAnswer(null);
    setStreamed('');
    setThoughts([]);
    setActiveThought('');

    const resultP = askData(text); // kicks off immediately (returns in ~1ms)

    // 1 — think out loud, intent-aware
    const steps = planThoughts(text);
    const done: string[] = [];
    for (const s of steps) {
      if (!alive()) return;
      setActiveThought(s);
      await sleep(480 + Math.floor(Math.random() * 380));
      if (!alive()) return;
      done.push(s);
      setThoughts([...done]);
      setActiveThought('');
    }

    const res = await resultP;
    if (!alive()) return;
    setAnswer(res);
    setPhase('streaming');

    // 2 — stream the answer word by word, with a natural cadence
    const tokens = res.answer.split(/(\s+)/);
    let acc = '';
    for (const tk of tokens) {
      if (!alive()) return;
      acc += tk;
      setStreamed(acc);
      if (tk.trim()) await sleep(/[.,;:—?!]$/.test(tk.trim()) ? 110 : 24 + Math.floor(Math.random() * 22));
    }
    if (!alive()) return;
    setPhase('done');
  }

  const confTone = (c: number): Tone => (c >= 0.85 ? 'success' : c >= 0.6 ? 'warn' : 'muted');

  return (
    <div className="rounded-2xl border border-border bg-surface p-4 sm:p-[18px] shadow-card">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-7 h-7 rounded-lg bg-primary-weak text-primary flex items-center justify-center flex-none">
          <Sparkles size={15} />
        </span>
        <div>
          <div className="text-[14px] font-semibold leading-tight">Ask about your data</div>
          <div className="text-[11.5px] text-text-3">AI-S-02 · grounded answers, scoped to your estates</div>
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); ask(q); }}
        className="flex items-center gap-2 h-11 px-3 rounded-xl border border-border bg-surface-2 focus-within:border-primary transition-colors"
      >
        <Search size={16} className="text-text-3 flex-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="e.g. Which estate has the most overdue work orders?"
          className="flex-1 bg-transparent outline-none text-[13.5px]"
          aria-label="Ask about your data"
        />
        <button type="submit" disabled={busy} className="h-8 px-3 rounded-lg bg-primary text-white text-[12.5px] font-medium disabled:opacity-60 flex-none inline-flex items-center gap-1.5">
          {busy ? <><Dots /> Thinking</> : 'Ask'}
        </button>
      </form>

      {phase === 'idle' && (
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          {SUGGESTIONS.map((s) => (
            <button key={s} onClick={() => ask(s)} className="text-[11.5px] text-text-2 border border-border-2 rounded-full px-2.5 h-7 hover:bg-surface-2 hover:border-primary transition-colors">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Thinking trace */}
      {(phase === 'thinking' || ((phase === 'streaming' || phase === 'done') && thoughts.length > 0)) && (
        <div className="mt-3.5 flex flex-col gap-1.5">
          {thoughts.map((t, i) => (
            <div key={i} className="flex items-center gap-2 text-[12px] text-text-3 animate-fade">
              <Check size={12} className="text-success flex-none" />
              <span>{t}</span>
            </div>
          ))}
          {activeThought && (
            <div className="flex items-center gap-2 text-[12.5px] text-text-2">
              <Dots />
              <span>{activeThought}</span>
            </div>
          )}
        </div>
      )}

      {/* Answer (streamed) */}
      {(phase === 'streaming' || phase === 'done') && answer && (
        <div className="mt-3 rounded-xl bg-surface-2 border border-border p-3.5">
          <p className="text-[13.5px] leading-relaxed">
            {phase === 'streaming' ? streamed : answer.answer}
            {phase === 'streaming' && <span className="inline-block w-[2px] h-[15px] align-[-2px] ml-0.5 bg-primary animate-pulse" />}
          </p>

          {phase === 'done' && (
            <>
              {answer.metric && answer.matched && (
                <div className="text-[24px] font-bold tracking-[-0.02em] mt-2 animate-fade">{answer.metric}</div>
              )}

              {answer.detail && answer.detail.length > 0 && (
                <ul className="mt-2.5 flex flex-col gap-1 border-t border-border pt-2.5">
                  {answer.detail.slice(0, 6).map((d, i) => (
                    <li key={i} className="text-[12.5px] text-text-2 flex items-center gap-2 animate-fade" style={{ animationDelay: `${i * 40}ms` }}>
                      <span className="w-1 h-1 rounded-full bg-text-3 flex-none" />
                      {d}
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-border animate-fade">
                {answer.confidence > 0 && (
                  <span className="inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md text-[11px] font-semibold" style={{ color: `var(--tone-${confTone(answer.confidence)})`, background: `color-mix(in srgb, var(--tone-${confTone(answer.confidence)}) 14%, transparent)` }}>
                    {Math.round(answer.confidence * 100)}% confidence
                  </span>
                )}
                {answer.sources.map((s) => (
                  <Link key={s.href} href={s.href} className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline">
                    {s.label} <ArrowUpRight size={13} />
                  </Link>
                ))}
                <span className="text-[11px] text-text-3 ml-auto">Grounded · scoped to {answer.scopeLabel}</span>
              </div>

              <button onClick={() => { setPhase('idle'); setQ(''); }} className="text-[11.5px] text-text-3 hover:text-text-2 mt-2.5">Ask another →</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Intent-aware "thinking" steps, so the trace reads like real reasoning. */
function planThoughts(q: string): string[] {
  const s = q.toLowerCase();
  const steps = ['Reading your question…'];
  const add = (t: string) => { if (!steps.includes(t)) steps.push(t); };
  if (/(overdue|sla|breach|work order|\bwo\b|job|maintenance|repair|ticket)/.test(s)) add('Scanning work orders…');
  if (/(collect|paid|rate|billing|charge|revenue)/.test(s)) add('Reviewing the billing ledger…');
  if (/(arrears|owe|owed|outstanding|defaulter|debt|unpaid)/.test(s)) add('Aging the arrears…');
  if (/(compliance|inspection|cert|audit|expir|statutory)/.test(s)) add('Checking the compliance register…');
  if (/(risk|asset|fail|predict|runtime|generator|preventive|reactive|ppm)/.test(s)) add('Consulting the failure-risk model…');
  if (/(sos|emergency|panic|security|incident)/.test(s)) add('Reviewing security events…');
  if (/(vendor|contractor|supplier)/.test(s)) add('Ranking vendors by SLA…');
  if (/(resident|occupanc|tenant|unit|vacant)/.test(s)) add('Counting residents & units…');
  if (/(estate|which|where|most|highest|top)/.test(s)) add('Grouping by estate…');
  if (steps.length === 1) add('Searching across your estates…');
  add('Grounding the answer in your records…');
  return steps;
}

function Dots() {
  return (
    <span className="inline-flex items-end gap-0.5 h-3">
      {[0, 1, 2].map((i) => (
        <span key={i} className="w-1 h-1 rounded-full bg-current animate-bounce" style={{ animationDelay: `${i * 130}ms`, animationDuration: '900ms' }} />
      ))}
    </span>
  );
}

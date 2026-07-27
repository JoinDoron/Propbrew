'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ArrowUpRight, Search, Sparkles } from 'lucide-react';
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

/** AI-S-02 — the interactive "ask about your data" surface. Honours the §11.4
 *  UX contract: loading, confidence, sources and a grounded answer (or a clean
 *  fallback), never a free-form hallucination. Answers are computed server-side
 *  over the caller's scoped data. */
export function AskData() {
  const [q, setQ] = useState('');
  const [answer, setAnswer] = useState<DataAnswer | null>(null);
  const [pending, start] = useTransition();

  const ask = (question: string) => {
    const text = question.trim();
    if (!text) return;
    setQ(text);
    start(async () => setAnswer(await askData(text)));
  };

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
        <button type="submit" disabled={pending} className="h-8 px-3 rounded-lg bg-primary text-white text-[12.5px] font-medium disabled:opacity-60 flex-none">
          {pending ? 'Thinking…' : 'Ask'}
        </button>
      </form>

      <div className="flex flex-wrap gap-1.5 mt-2.5">
        {SUGGESTIONS.map((s) => (
          <button key={s} onClick={() => ask(s)} disabled={pending} className="text-[11.5px] text-text-2 border border-border-2 rounded-full px-2.5 h-7 hover:bg-surface-2 hover:border-primary transition-colors disabled:opacity-60">
            {s}
          </button>
        ))}
      </div>

      {pending && (
        <div className="mt-3.5 flex items-center gap-2 text-[13px] text-text-3">
          <span className="w-3.5 h-3.5 rounded-full border-2 border-border-2 border-t-primary animate-spin" />
          Reading your scoped records…
        </div>
      )}

      {answer && !pending && (
        <div className="mt-3.5 rounded-xl bg-surface-2 border border-border p-3.5">
          <p className="text-[13.5px] leading-relaxed">{answer.answer}</p>

          {answer.metric && answer.matched && (
            <div className="text-[24px] font-bold tracking-[-0.02em] mt-2">{answer.metric}</div>
          )}

          {answer.detail && answer.detail.length > 0 && (
            <ul className="mt-2.5 flex flex-col gap-1 border-t border-border pt-2.5">
              {answer.detail.slice(0, 6).map((d, i) => (
                <li key={i} className="text-[12.5px] text-text-2 flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-text-3 flex-none" />
                  {d}
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-border">
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
        </div>
      )}
    </div>
  );
}

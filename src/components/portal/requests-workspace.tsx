'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, X, Sparkles, Star, Check, Clock, CircleDot } from 'lucide-react';
import { DomainStatus } from '@/components/domain';
import type { WorkOrderStatus } from '@/domain/enums';
import { toneVar, type Tone } from '@/lib/status-tones';
import { triageRequest, requestStepIndex, isRequestRateable, etaLabel, REQUEST_STEPS } from '@/domain/resident-portal';
import { raiseRequest } from '@/server/actions/resident-requests';

export type RequestRow = { id: string; ref: string; title: string; status: string; priority: string; assigneeName: string; createdAt: string };

const PRIORITY_TONE: Record<string, Tone> = { emergency: 'danger', high: 'danger', routine: 'warn', low: 'neutral' };

export function RequestsWorkspace({ requests }: { requests: RequestRow[] }) {
  const [tab, setTab] = useState<'all' | 'open' | 'closed'>('all');
  const [composing, setComposing] = useState(false);
  const [rated, setRated] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const open = requests.filter((r) => requestStepIndex(r.status) < 4 && requestStepIndex(r.status) >= 0);
  const shown = tab === 'all' ? requests : tab === 'open' ? open : requests.filter((r) => requestStepIndex(r.status) === 4);

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <div className="flex gap-1.5">
          {(['all', 'open', 'closed'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`h-8 px-3 rounded-full text-[12.5px] font-medium capitalize border transition-colors ${tab === t ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2'}`}>{t}{t === 'open' ? ` · ${open.length}` : ''}</button>
          ))}
        </div>
        <button onClick={() => setComposing(true)} className="ml-auto inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-white text-[13px] font-medium shadow-sm hover:brightness-105"><Plus size={16} /> Raise a request</button>
      </div>

      {shown.length === 0 ? (
        <div className="text-center py-14 border border-dashed border-border rounded-2xl">
          <CircleDot size={26} className="mx-auto text-text-3 mb-2" />
          <p className="text-[13.5px] font-medium">Nothing here yet</p>
          <p className="text-[12px] text-text-3 mt-0.5">Raise a request and we’ll track it to resolution.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map((r) => {
            const step = requestStepIndex(r.status);
            const rateable = isRequestRateable(r.status);
            return (
              <div key={r.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate">{r.title}</div>
                    <div className="text-[11.5px] text-text-3 font-mono">{r.ref} · {r.assigneeName === 'Unassigned' ? 'awaiting assignment' : r.assigneeName}</div>
                  </div>
                  <DomainStatus type="work_order" status={r.status as WorkOrderStatus} />
                </div>

                {step >= 0 ? <Tracker step={step} /> : <p className="text-[12px] text-negative mt-3">This request was {r.status}.</p>}

                {rateable && (
                  <div className="mt-3 pt-3 border-t border-border flex items-center gap-2">
                    <span className="text-[12px] text-text-3">{rated[r.id] ? 'Thanks for rating!' : 'How did we do?'}</span>
                    <div className="flex gap-0.5 ml-auto">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button key={n} onClick={() => { setRated((p) => ({ ...p, [r.id]: n })); flash('Thanks for your feedback!'); }} aria-label={`${n} stars`}>
                          <Star size={17} className={n <= (rated[r.id] ?? 0) ? 'fill-warning text-warning' : 'text-border-2'} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {composing && <RaiseDialog onClose={() => setComposing(false)} onDone={(ref) => { setComposing(false); flash(`Request ${ref} raised — we’re on it.`); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function Tracker({ step }: { step: number }) {
  return (
    <div className="flex items-center mt-3.5">
      {REQUEST_STEPS.map((label, i) => {
        const done = i < step, current = i === step;
        return (
          <div key={label} className="flex-1 flex items-center last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <span className={`w-5 h-5 rounded-full grid place-items-center flex-none ${done ? 'bg-success text-white' : current ? 'bg-primary text-white animate-[tms-pulse_1.6s_ease-in-out_infinite]' : 'bg-surface-3 text-text-3'}`}>
                {done ? <Check size={11} /> : current ? <Clock size={11} /> : <span className="w-1.5 h-1.5 rounded-full bg-current" />}
              </span>
              <span className={`text-[9px] ${current ? 'text-primary font-semibold' : 'text-text-3'}`}>{label}</span>
            </div>
            {i < REQUEST_STEPS.length - 1 && <div className="flex-1 h-0.5 mx-1 -mt-4" style={{ background: i < step ? toneVar('success') : 'var(--surface-3)' }} />}
          </div>
        );
      })}
    </div>
  );
}

function RaiseDialog({ onClose, onDone }: { onClose: () => void; onDone: (ref: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const triage = useMemo(() => (text.trim().length >= 4 ? triageRequest(text) : null), [text]);

  function submit() {
    setError(null);
    start(async () => {
      const r = await raiseRequest({ title: text });
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
      onDone(r.ref);
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[440px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[15px] font-semibold">Raise a request</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button>
        </div>

        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} autoFocus placeholder="What’s the problem? e.g. Kitchen tap is leaking under the sink" className="w-full px-3 py-2.5 rounded-xl border border-border-2 bg-surface text-[13.5px] leading-relaxed outline-none focus:border-primary resize-none" />

        {triage && (
          <div className="mt-2.5 rounded-xl border border-primary/25 bg-primary/[0.04] p-3 animate-fade">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-primary mb-1.5"><Sparkles size={12} /> We think this is…</div>
            <div className="flex items-center gap-2 flex-wrap text-[12.5px]">
              <span className="font-semibold">{triage.category.label}</span>
              <span className="px-1.5 h-[20px] inline-flex items-center rounded-md text-[10.5px] font-semibold capitalize" style={{ background: `color-mix(in srgb, ${toneVar(PRIORITY_TONE[triage.priority])} 14%, transparent)`, color: toneVar(PRIORITY_TONE[triage.priority]) }}>{triage.priority}{triage.escalated ? ' · urgent' : ''}</span>
              <span className="text-text-3">· target response {etaLabel(triage.etaHours)}</span>
            </div>
            <p className="text-[10.5px] text-text-3 mt-1.5">We’ll route it to the right team automatically — you can always add detail later.</p>
          </div>
        )}
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}

        <div className="flex justify-end gap-2 mt-3.5">
          <button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button>
          <button onClick={submit} disabled={pending || text.trim().length < 4} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Sending…' : 'Submit request'}</button>
        </div>
      </div>
    </div>
  );
}

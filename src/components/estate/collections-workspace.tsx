'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Banknote, TrendingUp, TriangleAlert, HandCoins, Bell, ChevronRight, X, Check } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { debtorRisk, DUNNING_LABEL, type DunningStage, type PromiseStatus } from '@/domain/estate';
import { sendReminder, advanceDunning, recordPromise } from '@/server/actions/estate';

export type CaseRow = { id: string; invoiceRef: string; residentName: string; unitLabel: string; amountMinor: number; agingDays: number; stage: DunningStage; remindersSent: number; promiseAmountMinor?: number; promiseDueISO?: string; promiseStatus?: PromiseStatus };

const money = (m: number) => `₦${Math.round(m / 100).toLocaleString('en-NG')}`;
const moneyK = (m: number) => { const n = m / 100; return n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1)}M` : `₦${Math.round(n / 1000)}k`; };
const LADDER: DunningStage[] = ['reminder', 'notice', 'plan', 'escalated'];
const PROMISE_TONE: Record<PromiseStatus, Tone> = { pending: 'info', kept: 'success', broken: 'danger' };

export function CollectionsWorkspace({ cases, forecast }: {
  cases: CaseRow[];
  forecast: { outstandingMinor: number; expectedMinor: number; recoveryPct: number };
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [promiseFor, setPromiseFor] = useState<CaseRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string; ref?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(r.ref ? `${ok} · ${r.ref}` : ok); } else flash(r.error ?? 'Failed'); });

  const sorted = [...cases].sort((a, b) => debtorRisk(b).score - debtorRisk(a).score);
  const highRisk = cases.filter((c) => debtorRisk(c).band === 'danger').length;
  const promises = cases.filter((c) => c.promiseStatus === 'pending').length;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero — recovery forecast */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#0d1f17 0%,#123a2a 55%,#1a5138 100%)' }}>
        <div className="relative flex items-center gap-5 flex-wrap">
          <Ring pct={forecast.recoveryPct} />
          <div className="min-w-0">
            <div className="text-[11px] text-white/70 flex items-center gap-1.5"><HandCoins size={12} /> ARREARS RECOVERY</div>
            <div className="text-[21px] font-bold tracking-[-0.02em] leading-tight mt-1">{money(forecast.expectedMinor)} <span className="text-white/60 text-[14px] font-medium">likely recoverable</span></div>
            <div className="text-[12.5px] text-white/75 mt-0.5">of {money(forecast.outstandingMinor)} outstanding · {cases.length} case{cases.length === 1 ? '' : 's'} · forecast from risk model</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Outstanding" value={moneyK(forecast.outstandingMinor)} tone="warn" icon={<Banknote size={16} />} />
        <Kpi label="Expected recovery" value={moneyK(forecast.expectedMinor)} tone="success" icon={<TrendingUp size={16} />} />
        <Kpi label="High-risk debtors" value={String(highRisk)} tone={highRisk ? 'danger' : 'success'} icon={<TriangleAlert size={16} />} />
        <Kpi label="Promises pending" value={String(promises)} tone={promises ? 'info' : 'neutral'} icon={<HandCoins size={16} />} />
      </div>

      <div className="flex flex-col gap-2.5">
        {sorted.map((c) => {
          const risk = debtorRisk(c);
          const stageIdx = LADDER.indexOf(c.stage);
          return (
            <div key={c.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold truncate">{c.residentName} <span className="text-[11px] text-text-3 font-normal">· {c.unitLabel}</span></div>
                  <div className="text-[11.5px] text-text-3 font-mono">{c.invoiceRef} · {c.agingDays}d overdue</div>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <div className="text-right"><div className="text-[15px] font-bold tracking-[-0.02em] leading-none">{money(c.amountMinor)}</div><div className="text-[10px] text-text-3">owed</div></div>
                  <span className="text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(risk.band)} 14%, transparent)`, color: toneVar(risk.band) }}>{risk.label} · {risk.score}</span>
                </div>
              </div>

              {/* dunning ladder */}
              <div className="flex items-center gap-1 mt-3">
                {LADDER.map((s, i) => (
                  <div key={s} className="flex items-center gap-1 flex-1 last:flex-none">
                    <span className="text-[10px] px-2 h-6 inline-flex items-center rounded-full font-medium whitespace-nowrap" style={{ background: i <= stageIdx ? `color-mix(in srgb, ${toneVar(i === stageIdx ? 'progress' : 'muted')} 16%, transparent)` : 'var(--surface-2)', color: i <= stageIdx ? toneVar(i === stageIdx ? 'progress' : 'muted') : 'var(--text-3)' }}>{DUNNING_LABEL[s]}</span>
                    {i < LADDER.length - 1 && <div className="flex-1 h-px min-w-[8px]" style={{ background: i < stageIdx ? toneVar('muted') : 'var(--border)' }} />}
                  </div>
                ))}
              </div>

              {c.promiseStatus && (
                <div className="mt-2.5 text-[11.5px] rounded-lg px-3 py-2 flex items-center gap-2" style={{ background: `color-mix(in srgb, ${toneVar(PROMISE_TONE[c.promiseStatus])} 8%, transparent)` }}>
                  <HandCoins size={13} style={{ color: toneVar(PROMISE_TONE[c.promiseStatus]) }} />
                  <span>Promise to pay {money(c.promiseAmountMinor ?? 0)} by {c.promiseDueISO}</span>
                  <span className="ml-auto font-semibold capitalize" style={{ color: toneVar(PROMISE_TONE[c.promiseStatus]) }}>{c.promiseStatus}</span>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                <button disabled={pending} onClick={() => act(() => sendReminder(c.id), 'Reminder sent')} className="text-[11.5px] px-2.5 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1 disabled:opacity-50"><Bell size={12} /> Remind{c.remindersSent ? ` (${c.remindersSent})` : ''}</button>
                <button disabled={pending} onClick={() => setPromiseFor(c)} className="text-[11.5px] px-2.5 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1 disabled:opacity-50"><HandCoins size={12} /> Promise to pay</button>
                {c.stage !== 'escalated' && <button disabled={pending} onClick={() => act(() => advanceDunning(c.id), 'Escalated a step')} className="text-[11.5px] px-2.5 h-8 rounded-lg bg-primary text-white font-medium inline-flex items-center gap-1 ml-auto disabled:opacity-50">Advance <ChevronRight size={12} /></button>}
              </div>
            </div>
          );
        })}
      </div>

      {promiseFor && <PromiseDialog c={promiseFor} onClose={() => setPromiseFor(null)} onDone={() => { setPromiseFor(null); flash('Promise recorded'); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function PromiseDialog({ c, onClose, onDone }: { c: CaseRow; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(String(Math.round(c.amountMinor / 100)));
  const [due, setDue] = useState('2026-08-05');
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await recordPromise(c.id, Number(amount), due); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[340px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Promise to pay</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{c.residentName}</div><div className="text-text-3">{c.invoiceRef} · {money(c.amountMinor)} owed</div></div>
        <label className="lblc">Amount (₦)</label><input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inpc" autoFocus />
        <label className="lblc mt-2.5">Promised by</label><input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="inpc" />
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50 inline-flex items-center gap-1"><Check size={13} /> {pending ? 'Saving…' : 'Record'}</button></div>
        <style>{`.lblc{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inpc{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inpc:focus{border-color:var(--primary)}`}</style>
      </div>
    </div>
  );
}
function Ring({ pct }: { pct: number }) {
  const band: Tone = pct >= 70 ? 'success' : pct >= 45 ? 'warn' : 'danger';
  const color = toneVar(band);
  return (
    <div className="relative flex-none" style={{ width: 84, height: 84 }}>
      <svg width={84} height={84} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(pct / 100) * 97.4} 97.4`} /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[20px] font-bold leading-none" style={{ color }}>{pct}%</span><span className="text-[8px] text-white/60 uppercase tracking-wide">recover</span></div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}

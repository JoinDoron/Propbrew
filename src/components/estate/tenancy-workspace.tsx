'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Home, LogIn, LogOut, CalendarClock, Wallet, ChevronRight, X, Check, KeyRound } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { TENANCY_FLOW, TENANCY_LABEL, tenancyStageTone, leaseRunwayDays, type TenancyStage, type DepositStatus } from '@/domain/estate';
import { advanceTenancy, settleDeposit } from '@/server/actions/estate';

export type TenancyRow = { id: string; residentName: string; unitLabel: string; stage: TenancyStage; applicationISO: string; moveInISO?: string; leaseEndISO?: string; moveOutISO?: string; rentMinor: number; depositMinor: number; depositStatus: DepositStatus };

const money = (m: number) => `₦${Math.round(m / 100).toLocaleString('en-NG')}`;
const moneyK = (m: number) => { const n = m / 100; return n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1)}M` : `₦${Math.round(n / 1000)}k`; };
const DEP_TONE: Record<DepositStatus, Tone> = { pending: 'info', held: 'progress', partially_refunded: 'warn', refunded: 'success', withheld: 'danger' };
const DEP_LABEL: Record<DepositStatus, string> = { pending: 'Deposit due', held: 'Deposit held', partially_refunded: 'Part-refunded', refunded: 'Refunded', withheld: 'Withheld' };

export function TenancyWorkspace({ tenancies, kpis, nowMs }: {
  tenancies: TenancyRow[];
  kpis: { active: number; inMotion: number; renewalsSoon: number; depositExposureMinor: number };
  nowMs: number;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [settleFor, setSettleFor] = useState<TenancyRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2800); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(ok); } else flash(r.error ?? 'Failed'); });

  const byStage = (s: TenancyStage) => tenancies.filter((t) => t.stage === s).length;
  const sorted = [...tenancies].sort((a, b) => TENANCY_FLOW.indexOf(a.stage) - TENANCY_FLOW.indexOf(b.stage) || a.residentName.localeCompare(b.residentName));

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero pipeline */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#0b1220 0%,#1a2440 55%,#243b63 100%)' }}>
        <div className="relative">
          <div className="flex items-center gap-1.5 text-[11px] text-white/70"><Home size={12} /> TENANCY LIFECYCLE</div>
          <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-1">{kpis.active} active · {kpis.inMotion} moving</div>
          <div className="mt-3 flex gap-1 overflow-x-auto pb-1">
            {TENANCY_FLOW.filter((s) => s !== 'closed').map((s) => {
              const n = byStage(s);
              return (
                <div key={s} className="flex-1 min-w-[74px] rounded-lg px-2 py-1.5" style={{ background: 'rgba(255,255,255,.06)' }}>
                  <div className="text-[15px] font-bold leading-none">{n}</div>
                  <div className="text-[9px] text-white/60 mt-0.5 whitespace-nowrap">{TENANCY_LABEL[s]}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Active" value={String(kpis.active)} tone="success" icon={<Home size={16} />} />
        <Kpi label="Moving in / out" value={String(kpis.inMotion)} tone="info" icon={<LogIn size={16} />} />
        <Kpi label="Renewals ≤45d" value={String(kpis.renewalsSoon)} tone={kpis.renewalsSoon ? 'warn' : 'success'} icon={<CalendarClock size={16} />} />
        <Kpi label="Deposits held" value={moneyK(kpis.depositExposureMinor)} tone="progress" icon={<Wallet size={16} />} />
      </div>

      <div className="flex flex-col gap-2.5">
        {sorted.map((t) => {
          const runway = leaseRunwayDays(t, nowMs);
          const canSettle = (t.stage === 'moving_out' || t.stage === 'closed') && (t.depositStatus === 'held' || t.depositStatus === 'pending');
          return (
            <div key={t.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
              <div className="flex items-start justify-between gap-2 flex-wrap">
                <div className="min-w-0 flex items-start gap-2.5">
                  <span className="w-9 h-9 rounded-xl grid place-items-center flex-none mt-0.5" style={{ background: `color-mix(in srgb, ${toneVar(tenancyStageTone(t.stage))} 13%, transparent)`, color: toneVar(tenancyStageTone(t.stage)) }}>{t.stage === 'moving_out' ? <LogOut size={17} /> : t.stage === 'moving_in' || t.stage === 'approved' ? <LogIn size={17} /> : <Home size={17} />}</span>
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold truncate">{t.residentName} <span className="text-[11px] text-text-3 font-normal">· {t.unitLabel}</span></div>
                    <div className="text-[11px] text-text-3">{moneyK(t.rentMinor)}/yr · applied {t.applicationISO}{t.moveInISO ? ` · in ${t.moveInISO}` : ''}{t.moveOutISO ? ` · out ${t.moveOutISO}` : ''}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <span className="text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(tenancyStageTone(t.stage))} 14%, transparent)`, color: toneVar(tenancyStageTone(t.stage)) }}>{TENANCY_LABEL[t.stage]}</span>
                  <span className="text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(DEP_TONE[t.depositStatus])} 14%, transparent)`, color: toneVar(DEP_TONE[t.depositStatus]) }}>{DEP_LABEL[t.depositStatus]}</span>
                </div>
              </div>
              {runway !== null && t.stage === 'active' && (
                <div className="mt-2.5 text-[11px] flex items-center gap-2"><CalendarClock size={12} className="text-text-3" /><span className="text-text-3">Lease</span><div className="flex-1 h-1.5 rounded-full bg-surface-2 overflow-hidden max-w-[220px]"><div className="h-full rounded-full" style={{ width: `${Math.max(4, Math.min(100, (runway / 365) * 100))}%`, background: toneVar(runway <= 45 ? 'warn' : 'success') }} /></div><span className="font-mono" style={{ color: toneVar(runway <= 45 ? 'warn' : 'success') }}>{runway < 0 ? `${-runway}d over` : `${runway}d left`}</span></div>
              )}
              <div className="flex gap-2 mt-3">
                {t.stage !== 'closed' && <button disabled={pending} onClick={() => act(() => advanceTenancy(t.id), `Advanced to ${TENANCY_LABEL[nextOf(t.stage)]}`)} className="text-[11.5px] px-2.5 h-8 rounded-lg bg-primary text-white font-medium inline-flex items-center gap-1 disabled:opacity-50">Advance <ChevronRight size={12} /></button>}
                {canSettle && <button disabled={pending} onClick={() => setSettleFor(t)} className="text-[11.5px] px-2.5 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1 disabled:opacity-50"><KeyRound size={12} /> Settle deposit</button>}
              </div>
            </div>
          );
        })}
      </div>

      {settleFor && <SettleDialog t={settleFor} onClose={() => setSettleFor(null)} onDone={() => { setSettleFor(null); flash('Deposit settled'); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function nextOf(s: TenancyStage): TenancyStage { const i = TENANCY_FLOW.indexOf(s); return i < TENANCY_FLOW.length - 1 ? TENANCY_FLOW[i + 1] : s; }

function SettleDialog({ t, onClose, onDone }: { t: TenancyRow; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [refund, setRefund] = useState(String(Math.round(t.depositMinor / 100)));
  const [error, setError] = useState<string | null>(null);
  const held = Math.round(t.depositMinor / 100);
  function submit() { setError(null); start(async () => { const r = await settleDeposit(t.id, Number(refund)); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[340px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Settle deposit</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{t.residentName}</div><div className="text-text-3">{t.unitLabel} · {money(t.depositMinor)} held</div></div>
        <label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">Refund to resident (₦)</label>
        <input value={refund} onChange={(e) => setRefund(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary" autoFocus />
        <p className="text-[10.5px] text-text-3 mt-1.5">Withholding {money(Math.max(0, t.depositMinor - Number(refund) * 100))} for damages/arrears.</p>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50 inline-flex items-center gap-1"><Check size={13} /> {pending ? 'Saving…' : 'Settle'}</button></div>
        <p className="text-[10px] text-text-3 mt-2">Held {money(held * 100)}</p>
      </div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}

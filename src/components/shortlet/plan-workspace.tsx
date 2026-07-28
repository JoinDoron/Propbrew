'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Crown, Sparkles, AlertTriangle, Building2, Zap, Receipt } from 'lucide-react';
import { toneVar } from '@/lib/status-tones';
import { changePlan } from '@/server/actions/shortlet';

export type PlanCard = { key: string; name: string; priceMonthlyMinor: number | null; apartmentCap: number; badge?: string; entitlements: string[] };
export type Recommendation = { key: string; reasons: string[] };

const money = (m: number) => `₦${(m / 100).toLocaleString('en-NG')}`;
const capLabel = (c: number) => (c === Infinity ? '12+' : String(c));

export function PlanWorkspace({ plans, currentKey, apartmentCount, recommendation, order }: { plans: PlanCard[]; currentKey: string; apartmentCount: number; recommendation: Recommendation; order: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [annual, setAnnual] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };
  const idx = (k: string) => order.indexOf(k);

  const current = plans.find((p) => p.key === currentKey)!;
  const overCap = apartmentCount > current.apartmentCap;
  const recommended = plans.find((p) => p.key === recommendation.key)!;
  const showRec = recommendation.key !== currentKey && idx(recommendation.key) > idx(currentKey);

  const pick = (p: PlanCard) => {
    if (p.key === 'enterprise') { flash('Sales will reach out to set up Enterprise.'); return; }
    start(async () => { const r = await changePlan(p.key as never); if (r.ok) { router.refresh(); flash(`Switched to ${p.name} — prorated to today.`); } else flash(r.error); });
  };

  return (
    <div className="flex flex-col gap-3.5">
      {/* Current plan + usage */}
      <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] text-text-3">Current plan</div>
            <div className="text-[20px] font-bold tracking-[-0.02em] flex items-center gap-2">{current.name}{current.priceMonthlyMinor && <span className="text-[13px] font-normal text-text-3">· {money(current.priceMonthlyMinor)}/mo</span>}</div>
            <div className="text-[11.5px] text-positive mt-0.5 flex items-center gap-1"><Sparkles size={11} /> 14-day free trial · 9 days left · no card required</div>
          </div>
          <div className="min-w-[180px]">
            <div className="flex items-center justify-between text-[11px] mb-1"><span className="text-text-3 flex items-center gap-1"><Building2 size={11} /> Apartments</span><span className="font-mono font-semibold">{apartmentCount} / {capLabel(current.apartmentCap)}</span></div>
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, current.apartmentCap === Infinity ? 40 : (apartmentCount / current.apartmentCap) * 100)}%`, background: toneVar(overCap ? 'danger' : apartmentCount >= current.apartmentCap ? 'warn' : 'success') }} /></div>
          </div>
        </div>
        {overCap && (
          <div className="mt-3 rounded-xl border border-[color:var(--tone-danger)]/35 bg-[color:var(--tone-danger)]/[0.06] px-3 py-2 text-[12px] flex items-center gap-2"><AlertTriangle size={14} className="text-negative flex-none" /> You have <b>{apartmentCount}</b> apartments but your plan caps at <b>{capLabel(current.apartmentCap)}</b>. Upgrade to keep all units active.</div>
        )}
      </div>

      {showRec && (
        <div className="rounded-xl border border-primary/30 bg-primary/[0.05] px-4 py-2.5 text-[12.5px] flex items-center gap-2 flex-wrap">
          <Sparkles size={14} className="text-primary flex-none" />
          <span><b>{recommended.name}</b> fits you best — you have {recommendation.reasons.join(' and ')}.</span>
          <button onClick={() => pick(recommended)} disabled={pending} className="ml-auto h-8 px-3 rounded-lg bg-primary text-white text-[12px] font-medium disabled:opacity-50">Switch to {recommended.name}</button>
        </div>
      )}

      <div className="flex items-center gap-2 justify-center">
        <span className={`text-[12px] ${!annual ? 'font-semibold' : 'text-text-3'}`}>Monthly</span>
        <button role="switch" aria-checked={annual} onClick={() => setAnnual((v) => !v)} className={`w-9 h-5 rounded-full relative transition-colors ${annual ? 'bg-primary' : 'bg-surface-3'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all ${annual ? 'left-4' : 'left-0.5'}`} /></button>
        <span className={`text-[12px] ${annual ? 'font-semibold' : 'text-text-3'}`}>Annual <span className="text-positive">−10%</span></span>
      </div>

      {/* Pricing cards */}
      <div className="grid grid-cols-1 min-[560px]:grid-cols-2 min-[900px]:grid-cols-5 gap-2.5">
        {plans.map((p) => {
          const isCurrent = p.key === currentKey;
          const isRec = p.key === recommendation.key && showRec;
          const monthly = p.priceMonthlyMinor;
          const shown = monthly === null ? null : annual ? Math.round(monthly * 0.9) : monthly;
          return (
            <div key={p.key} className={`relative rounded-2xl border p-3.5 flex flex-col ${isCurrent ? 'border-primary shadow-float' : isRec ? 'border-primary/40' : 'border-border'} bg-surface shadow-card`}>
              {p.badge && <span className="absolute -top-2 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase px-2 py-0.5 rounded-full bg-primary text-white">{p.badge}</span>}
              <div className="text-[13.5px] font-bold flex items-center gap-1">{p.key === 'enterprise' && <Crown size={13} className="text-warning" />}{p.name}</div>
              <div className="mt-1 h-9">{shown === null ? <span className="text-[15px] font-bold">Custom</span> : <><span className="text-[19px] font-bold tracking-[-0.02em]">{money(shown)}</span><span className="text-[10px] text-text-3">/mo{annual ? ' (billed yearly)' : ''}</span></>}</div>
              <div className="text-[10.5px] text-text-3 mb-2">Up to {capLabel(p.apartmentCap)} apartments</div>
              <div className="flex flex-col gap-1 flex-1">
                {p.entitlements.slice(-4).map((e) => (
                  <div key={e} className="flex items-start gap-1.5 text-[10.5px]"><Check size={11} className="text-positive flex-none mt-0.5" />{e}</div>
                ))}
                {p.entitlements.length > 4 && <div className="text-[10px] text-text-3 pl-4">+ {p.entitlements.length - 4} more</div>}
              </div>
              <button onClick={() => pick(p)} disabled={pending || isCurrent} className={`mt-3 h-8 rounded-lg text-[12px] font-medium ${isCurrent ? 'border border-border-2 text-text-3' : 'bg-primary text-white'} disabled:opacity-60`}>
                {isCurrent ? 'Current plan' : p.key === 'enterprise' ? 'Contact sales' : idx(p.key) > idx(currentKey) ? 'Upgrade' : 'Downgrade'}
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-4 text-[11px] text-text-3"><span className="inline-flex items-center gap-1"><Zap size={11} /> Upgrade/downgrade anytime, prorated</span><span className="inline-flex items-center gap-1"><Receipt size={11} /> Naira billing — card · transfer · USSD</span><span>Cancel anytime</span></div>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

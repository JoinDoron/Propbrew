'use client';

import { useState } from 'react';
import { Building2, TriangleAlert, Fuel, Banknote, Wrench, HeartPulse, ArrowDownWideNarrow, ShieldAlert } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { estateIndex, type EstateVitals } from '@/domain/facility';

const moneyK = (m: number) => { const n = m / 100; return n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `₦${Math.round(n / 1000)}k` : `₦${Math.round(n)}`; };

type SortKey = 'index' | 'diesel' | 'arrears' | 'overdue';
const SORTS: { key: SortKey; label: string }[] = [{ key: 'index', label: 'Attention' }, { key: 'diesel', label: 'Diesel spend' }, { key: 'arrears', label: 'Arrears' }, { key: 'overdue', label: 'Overdue work' }];

export function PortfolioWorkspace({ estates, totals, canSeeMoney }: {
  estates: EstateVitals[];
  totals: { avgIndex: number; openWos: number; overdueWos: number; openAlarms: number; dieselSpendMinor: number; arrearsMinor: number };
  canSeeMoney: boolean;
}) {
  const [sort, setSort] = useState<SortKey>('index');
  const sorted = [...estates].sort((a, b) => {
    if (sort === 'diesel') return b.dieselSpendMinor - a.dieselSpendMinor;
    if (sort === 'arrears') return (b.arrearsMinor ?? 0) - (a.arrearsMinor ?? 0);
    if (sort === 'overdue') return b.overdueWos - a.overdueWos;
    return estateIndex(a).score - estateIndex(b).score; // worst-first
  });
  const worst = [...estates].sort((a, b) => estateIndex(a).score - estateIndex(b).score)[0];
  const portfolioBand: Tone = totals.avgIndex >= 85 ? 'success' : totals.avgIndex >= 65 ? 'warn' : 'danger';

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#0b1220 0%,#141c3d 55%,#241b53 100%)' }}>
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full opacity-20" style={{ background: `radial-gradient(circle, ${toneVar(portfolioBand)}, transparent 70%)` }} />
        <div className="relative flex items-center gap-5 flex-wrap">
          <Ring score={totals.avgIndex} band={portfolioBand} label="index" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-white/70"><Building2 size={12} /> PORTFOLIO · {estates.length} estate{estates.length === 1 ? '' : 's'}</div>
            <div className="text-[21px] font-bold tracking-[-0.02em] leading-tight mt-1">Estate portfolio · <span style={{ color: toneVar(portfolioBand) }}>{portfolioBand === 'success' ? 'Healthy' : portfolioBand === 'warn' ? 'Watch' : 'At risk'}</span></div>
            {worst && <div className="text-[12.5px] text-white/75 mt-0.5">{totals.overdueWos} overdue jobs · {totals.openAlarms} open alarms · <span className="text-white/90 font-medium">{worst.name}</span> needs the most attention</div>}
          </div>
        </div>
      </div>

      {/* Portfolio KPIs */}
      <div className={`grid grid-cols-2 ${canSeeMoney ? 'min-[720px]:grid-cols-4' : 'min-[720px]:grid-cols-3'} gap-2.5`}>
        <Kpi label="Open work" value={String(totals.openWos)} sub={`${totals.overdueWos} overdue`} tone={totals.overdueWos ? 'warn' : 'success'} icon={<Wrench size={16} />} />
        <Kpi label="Open alarms" value={String(totals.openAlarms)} sub="across estates" tone={totals.openAlarms ? 'danger' : 'success'} icon={<TriangleAlert size={16} />} />
        <Kpi label="Diesel spend" value={moneyK(totals.dieselSpendMinor)} sub="per month" tone="progress" icon={<Fuel size={16} />} />
        {canSeeMoney && <Kpi label="Arrears" value={moneyK(totals.arrearsMinor)} sub="outstanding" tone={totals.arrearsMinor ? 'warn' : 'success'} icon={<Banknote size={16} />} />}
      </div>

      {/* Sort */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-text-3 inline-flex items-center gap-1"><ArrowDownWideNarrow size={13} /> Sort</span>
        {SORTS.filter((s) => canSeeMoney || s.key !== 'arrears').map((s) => (
          <button key={s.key} onClick={() => setSort(s.key)} className={`text-[11.5px] px-2.5 h-7 rounded-full border ${sort === s.key ? 'bg-primary text-white border-primary' : 'border-border-2 text-text-2'}`}>{s.label}</button>
        ))}
      </div>

      {/* Estate scorecards */}
      <div className="grid grid-cols-1 min-[720px]:grid-cols-2 gap-2.5">
        {sorted.map((e) => {
          const idx = estateIndex(e);
          return (
            <div key={e.siteId} className="bg-surface border border-border rounded-2xl shadow-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold truncate">{e.name}</div>
                  <div className="text-[11px] text-text-3 capitalize">{e.kind}</div>
                </div>
                <div className="flex items-center gap-2 flex-none">
                  <span className="text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(idx.band)} 14%, transparent)`, color: toneVar(idx.band) }}>{idx.label}</span>
                  <div className="relative" style={{ width: 44, height: 44 }}>
                    <svg width={44} height={44} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="var(--surface-2)" strokeWidth="4" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={toneVar(idx.band)} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(idx.score / 100) * 97.4} 97.4`} /></svg>
                    <div className="absolute inset-0 grid place-items-center text-[12px] font-bold" style={{ color: toneVar(idx.band) }}>{idx.score}</div>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3">
                <Metric icon={<HeartPulse size={13} />} value={`${e.healthScore}`} label="systems" tone={e.healthScore >= 90 ? 'success' : e.healthScore >= 70 ? 'warn' : 'danger'} />
                <Metric icon={<Wrench size={13} />} value={`${e.openWos}`} label={`${e.overdueWos} overdue`} tone={e.overdueWos ? 'warn' : 'neutral'} />
                <Metric icon={<TriangleAlert size={13} />} value={`${e.openAlarms}`} label="alarms" tone={e.openAlarms ? 'danger' : 'neutral'} />
                <Metric icon={<Fuel size={13} />} value={moneyK(e.dieselSpendMinor)} label={`${e.gensetPct}% genset`} tone="progress" />
                <Metric icon={<ShieldAlert size={13} />} value={`${e.contractsAtRisk}`} label="SLA risk" tone={e.contractsAtRisk ? 'warn' : 'neutral'} />
                {canSeeMoney && <Metric icon={<Banknote size={13} />} value={e.arrearsMinor !== null ? moneyK(e.arrearsMinor) : '—'} label="arrears" tone={e.arrearsMinor ? 'warn' : 'neutral'} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Metric({ icon, value, label, tone }: { icon: React.ReactNode; value: string; label: string; tone: Tone }) {
  return (
    <div className="rounded-xl bg-surface-2 p-2.5">
      <span className="inline-flex items-center gap-1 text-[10px] text-text-3" style={{ color: tone !== 'neutral' ? toneVar(tone) : undefined }}>{icon}</span>
      <div className="text-[14px] font-bold tracking-[-0.02em] leading-none mt-1 tabular-nums">{value}</div>
      <div className="text-[9.5px] text-text-3 mt-0.5 truncate">{label}</div>
    </div>
  );
}
function Ring({ score, band, label }: { score: number; band: Tone; label: string }) {
  const color = toneVar(band);
  return (
    <div className="relative flex-none" style={{ width: 84, height: 84 }}>
      <svg width={84} height={84} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(score / 100) * 97.4} 97.4`} /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[22px] font-bold leading-none" style={{ color }}>{score}</span><span className="text-[8px] text-white/60 uppercase tracking-wide">{label}</span></div>
    </div>
  );
}
function Kpi({ label, value, sub, tone, icon }: { label: string; value: string; sub: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div><div className="text-[10px] text-text-3 mt-0.5">{sub}</div></div>;
}

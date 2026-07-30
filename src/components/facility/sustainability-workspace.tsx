'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Leaf, Fuel, Droplet, Sun, Wrench, Lightbulb, Flame, TrendingDown, Target, X, Check } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { targetProgress, type SustainabilityTarget, type ReductionScenario } from '@/domain/facility';
import { setSustainabilityTarget } from '@/server/actions/facility';

const money = (m: number) => `₦${Math.round(m / 100).toLocaleString('en-NG')}`;
const moneyK = (m: number) => { const n = m / 100; return n >= 1_000_000 ? `₦${(n / 1_000_000).toFixed(1)}M` : `₦${Math.round(n / 1000)}k`; };
const SCEN_ICON: Record<string, React.ReactNode> = { solar: <Sun size={16} />, service: <Wrench size={16} />, led: <Lightbulb size={16} />, gas: <Flame size={16} /> };

export type MonthPoint = { label: string; co2Kg: number; dieselLitres: number };

export function SustainabilityWorkspace({ esg, kpis, months, mix, scenarios, targets }: {
  esg: { score: number; band: Tone; label: string };
  kpis: { carbonKg: number; gensetPct: number; waterM3: number; renewableReadiness: number };
  months: MonthPoint[]; mix: { gridKwh: number; gensetKwh: number };
  scenarios: ReductionScenario[]; targets: SustainabilityTarget[];
}) {
  const maxCo2 = Math.max(...months.map((m) => m.co2Kg), 1);
  const totalKwh = mix.gridKwh + mix.gensetKwh || 1;
  const gridShare = Math.round((mix.gridKwh / totalKwh) * 100);
  const [editing, setEditing] = useState<SustainabilityTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const trendDelta = months.length >= 2 ? Math.round(((months[months.length - 1].co2Kg - months[0].co2Kg) / months[0].co2Kg) * 100) : 0;

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#08221a 0%,#0f3b2c 55%,#14513a 100%)' }}>
        <div className="absolute -right-10 -top-10 w-56 h-56 rounded-full opacity-20" style={{ background: `radial-gradient(circle, ${toneVar(esg.band)}, transparent 70%)` }} />
        <div className="relative flex items-center gap-5 flex-wrap">
          <ScoreRing score={esg.score} band={esg.band} />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-white/70"><Leaf size={12} /> ESG PERFORMANCE</div>
            <div className="text-[22px] font-bold tracking-[-0.02em] leading-tight mt-1">Sustainability · <span style={{ color: toneVar(esg.band) }}>{esg.label}</span></div>
            <div className="text-[12.5px] text-white/70 mt-0.5 flex items-center gap-1">{trendDelta <= 0 ? <TrendingDown size={13} className="text-[#34d399]" /> : null} Carbon {trendDelta <= 0 ? 'down' : 'up'} {Math.abs(trendDelta)}% over 6 months · {kpis.renewableReadiness}% renewable-ready</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Carbon this month" value={`${(kpis.carbonKg / 1000).toFixed(1)}t`} sub="CO₂ from diesel" tone="success" icon={<Leaf size={16} />} />
        <Kpi label="Genset reliance" value={`${kpis.gensetPct}%`} sub="of run-hours" tone={kpis.gensetPct <= 30 ? 'success' : 'warn'} icon={<Fuel size={16} />} />
        <Kpi label="Water draw" value={`${kpis.waterM3}m³`} sub="this month" tone="info" icon={<Droplet size={16} />} />
        <Kpi label="Renewable-ready" value={`${kpis.renewableReadiness}%`} sub="grid share" tone="progress" icon={<Sun size={16} />} />
      </div>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-3.5">
        {/* Carbon trend */}
        <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="text-[12.5px] font-semibold mb-3">Carbon trend · kg CO₂/mo</div>
          <div className="flex items-end justify-between gap-2 h-[140px]">
            {months.map((m, i) => (
              <div key={m.label} className="flex flex-col items-center gap-1.5 flex-1">
                <span className="text-[10px] text-text-3 tabular-nums">{(m.co2Kg / 1000).toFixed(1)}t</span>
                <div className="w-full rounded-t-md transition-all" style={{ height: `${Math.max(6, (m.co2Kg / maxCo2) * 108)}px`, background: i === months.length - 1 ? toneVar('success') : 'color-mix(in srgb, var(--tone-success) 40%, transparent)' }} />
                <span className="text-[10px] text-text-3">{m.label}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Energy mix */}
        <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="text-[12.5px] font-semibold mb-3">Energy mix · this month</div>
          <div className="flex items-center gap-4">
            <div className="relative flex-none" style={{ width: 96, height: 96 }}>
              <svg width={96} height={96} viewBox="0 0 36 36" className="-rotate-90">
                <circle cx="18" cy="18" r="15.5" fill="none" stroke={toneVar('warn')} strokeWidth="4" />
                <circle cx="18" cy="18" r="15.5" fill="none" stroke={toneVar('success')} strokeWidth="4" strokeDasharray={`${(gridShare / 100) * 97.4} 97.4`} strokeLinecap="round" />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[18px] font-bold leading-none">{gridShare}%</span><span className="text-[8px] text-text-3 uppercase">grid</span></div>
            </div>
            <div className="flex flex-col gap-2 text-[12px]">
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: toneVar('success') }} /> Grid · {mix.gridKwh.toLocaleString()} kWh</div>
              <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full" style={{ background: toneVar('warn') }} /> Genset (diesel) · {mix.gensetKwh.toLocaleString()} kWh</div>
              <div className="text-[10.5px] text-text-3 mt-1">Every kWh moved off the genset cuts diesel spend and carbon.</div>
            </div>
          </div>
        </section>
      </div>

      {/* Reduction pathways */}
      <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
        <div className="flex items-center gap-2 mb-1"><TrendingDown size={15} style={{ color: toneVar('success') }} /><span className="text-[13px] font-semibold">Reduction pathways</span><span className="text-[11px] text-text-3 ml-1">modelled from your current diesel burn</span></div>
        <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-2.5 mt-3">
          {scenarios.map((s) => (
            <div key={s.id} className="rounded-xl border border-border-2 p-3.5">
              <div className="flex items-center gap-2 mb-2"><span className="w-8 h-8 rounded-lg grid place-items-center" style={{ background: `color-mix(in srgb, ${toneVar('success')} 13%, transparent)`, color: toneVar('success') }}>{SCEN_ICON[s.id]}</span><div className="text-[13px] font-semibold leading-tight">{s.title}</div></div>
              <p className="text-[11px] text-text-3 mb-2.5 leading-snug">{s.detail}</p>
              <div className="grid grid-cols-3 gap-1.5 text-center">
                <Stat value={`−${(s.co2SavedKg / 1000).toFixed(1)}t`} label="CO₂/yr" tone="success" />
                <Stat value={`${moneyK(s.nairaSavedMinor)}`} label="saved/yr" tone="progress" />
                <Stat value={s.paybackMonths !== null ? `${s.paybackMonths}mo` : '—'} label="payback" tone="info" />
              </div>
              <div className="text-[10px] text-text-3 mt-2 text-center">Capex ≈ {money(s.capexMinor)}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Targets */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Target size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Targets</span></div>
        <div className="divide-y divide-border">
          {targets.map((t) => {
            const p = targetProgress(t);
            return (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="text-[12.5px] font-medium">{t.label}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono" style={{ color: toneVar(p.band) }}>{p.pct}%</span>
                    <button onClick={() => setEditing(t)} className="text-[11px] px-2 h-6 rounded-lg border border-border-2 text-text-2">Adjust</button>
                  </div>
                </div>
                <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full transition-all" style={{ width: `${p.pct}%`, background: toneVar(p.band) }} /></div>
                <div className="text-[10.5px] text-text-3 mt-1 tabular-nums">{t.baselineValue}{t.unit.startsWith('%') ? '' : ''} → now {t.currentValue} → target {t.targetValue} {t.unit} · by {t.dueISO}</div>
              </div>
            );
          })}
        </div>
      </section>

      {editing && <TargetDialog target={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); flash('Target updated'); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function TargetDialog({ target, onClose, onDone }: { target: SustainabilityTarget; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [val, setVal] = useState(String(target.targetValue));
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await setSustainabilityTarget(target.id, Number(val)); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(); }); }
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[320px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease]">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Adjust target</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{target.label}</div><div className="text-text-3">Baseline {target.baselineValue} · now {target.currentValue} {target.unit}</div></div>
        <label className="block text-[11px] font-semibold uppercase tracking-[.04em] text-text-3 mb-1">Target ({target.unit})</label>
        <input value={val} onChange={(e) => setVal(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="w-full h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary" autoFocus />
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
        <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={submit} disabled={pending} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50 inline-flex items-center gap-1"><Check size={13} /> {pending ? 'Saving…' : 'Save'}</button></div>
      </div>
    </div>
  );
}

function ScoreRing({ score, band }: { score: number; band: Tone }) {
  const color = toneVar(band);
  return (
    <div className="relative flex-none" style={{ width: 84, height: 84 }}>
      <svg width={84} height={84} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(score / 100) * 97.4} 97.4`} /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[22px] font-bold leading-none" style={{ color }}>{score}</span><span className="text-[8px] text-white/60 uppercase tracking-wide">ESG</span></div>
    </div>
  );
}
function Stat({ value, label, tone }: { value: string; label: string; tone: Tone }) {
  return <div className="rounded-lg bg-surface-2 py-1.5"><div className="text-[13px] font-bold leading-none" style={{ color: toneVar(tone) }}>{value}</div><div className="text-[9px] text-text-3 mt-0.5">{label}</div></div>;
}
function Kpi({ label, value, sub, tone, icon }: { label: string; value: string; sub: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div><div className="text-[10px] text-text-3 mt-0.5">{sub}</div></div>;
}

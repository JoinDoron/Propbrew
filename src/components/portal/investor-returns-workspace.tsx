'use client';

import { useMemo, useState } from 'react';
import { TrendingUp, Sparkles, RotateCcw } from 'lucide-react';
import type { InvestorProject } from '@/domain/entities';
import { holdingOf, projectReturns } from '@/domain/investor-portal';
import { toneVar } from '@/lib/status-tones';

function naira(minor: number): string {
  const n = minor / 100;
  if (n >= 1e9) return `₦${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `₦${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `₦${Math.round(n / 1e3)}k`;
  return `₦${Math.round(n)}`;
}

type Scenario = { key: string; label: string; appr: number; yield: number };
const SCENARIOS: Scenario[] = [
  { key: 'cons', label: 'Conservative', appr: 6, yield: 4 },
  { key: 'base', label: 'Base case', appr: 12, yield: 6 },
  { key: 'opt', label: 'Optimistic', appr: 18, yield: 8 },
];

export function InvestorReturnsWorkspace({ projects }: { projects: InvestorProject[] }) {
  const holdings = useMemo(() => projects.map((p) => ({ id: p.id, name: p.name.split(' (')[0], invested: holdingOf(p).investedMinor })), [projects]);
  const portfolioInvested = holdings.reduce((n, h) => n + h.invested, 0);

  const [sel, setSel] = useState('all');
  const [years, setYears] = useState(5);
  const [appr, setAppr] = useState(12);
  const [yld, setYld] = useState(6);

  const invested = sel === 'all' ? portfolioInvested : holdings.find((h) => h.id === sel)?.invested ?? 0;
  const proj = projectReturns(invested, years, appr, yld);

  const applyScenario = (s: Scenario) => { setAppr(s.appr); setYld(s.yield); };
  const reset = () => { setYears(5); setAppr(12); setYld(6); };

  // stacked bar widths
  const total = proj.totalValueMinor || 1;
  const w = (m: number) => `${(m / total) * 100}%`;

  return (
    <div className="flex flex-col gap-3.5">
      <div className="rounded-2xl border border-primary/25 bg-primary/[0.04] p-3.5 flex items-start gap-2.5">
        <Sparkles size={15} className="text-primary flex-none mt-0.5" />
        <p className="text-[12px] text-text-2">Model your returns by adjusting the hold period and assumptions. Figures are <b>estimates</b> on the inputs below — not a forecast, guarantee or financial advice.</p>
      </div>

      {/* Project selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        <button onClick={() => setSel('all')} className={`flex-none h-8 px-3 rounded-full text-[12.5px] font-medium border ${sel === 'all' ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2'}`}>Whole portfolio</button>
        {holdings.map((h) => (
          <button key={h.id} onClick={() => setSel(h.id)} className={`flex-none h-8 px-3 rounded-full text-[12.5px] font-medium border ${sel === h.id ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2'}`}>{h.name}</button>
        ))}
      </div>

      {/* Result */}
      <div className="bg-surface border border-border rounded-2xl shadow-card p-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-[12px] text-text-3">Projected value in {years} year{years === 1 ? '' : 's'}</div>
            <div className="text-[30px] font-bold tracking-[-0.02em] leading-none mt-1">{naira(proj.totalValueMinor)}</div>
            <div className="text-[12px] mt-1" style={{ color: toneVar('success') }}>+{naira(proj.capitalGainMinor + proj.rentalIncomeMinor)} · {proj.roiPct}% total return</div>
          </div>
          <div className="text-right"><div className="text-[11px] text-text-3">Invested</div><div className="text-[15px] font-semibold font-mono">{naira(invested)}</div></div>
        </div>
        {/* Stacked bar */}
        <div className="mt-3.5 h-3 rounded-full overflow-hidden flex bg-surface-2">
          <div className="h-full" title="Invested" style={{ width: w(invested), background: toneVar('info') }} />
          <div className="h-full" title="Capital growth" style={{ width: w(proj.capitalGainMinor), background: toneVar('success') }} />
          <div className="h-full" title="Rental income" style={{ width: w(proj.rentalIncomeMinor), background: toneVar('progress') }} />
        </div>
        <div className="flex flex-wrap gap-3 mt-2 text-[10.5px] text-text-3">
          <Legend tone="info" label={`Invested ${naira(invested)}`} />
          <Legend tone="success" label={`Capital growth ${naira(proj.capitalGainMinor)}`} />
          <Legend tone="progress" label={`Rental income ${naira(proj.rentalIncomeMinor)}`} />
        </div>
      </div>

      {/* Controls */}
      <div className="bg-surface border border-border rounded-2xl shadow-card p-4 flex flex-col gap-4">
        <div className="flex items-center justify-between"><span className="text-[12.5px] font-semibold flex items-center gap-1.5"><TrendingUp size={14} /> Assumptions</span><button onClick={reset} className="text-[11.5px] text-text-3 hover:text-text-2 inline-flex items-center gap-1"><RotateCcw size={12} /> Reset</button></div>
        <Slider label="Hold period" value={years} min={1} max={10} step={1} suffix={years === 1 ? 'year' : 'years'} onChange={setYears} />
        <Slider label="Annual appreciation" value={appr} min={0} max={25} step={1} suffix="%/yr" onChange={setAppr} />
        <Slider label="Rental yield" value={yld} min={0} max={15} step={1} suffix="%/yr" onChange={setYld} />
        <div className="flex gap-1.5 pt-1">
          {SCENARIOS.map((s) => {
            const on = appr === s.appr && yld === s.yield;
            return <button key={s.key} onClick={() => applyScenario(s)} className={`flex-1 h-9 rounded-xl text-[12px] font-medium border ${on ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 text-text-2'}`}>{s.label}</button>;
          })}
        </div>
      </div>

      <p className="text-[11px] text-text-3">Estimates compound appreciation on your invested capital and add simple rental income at the chosen yield. Real returns depend on the market, timing and costs.</p>
    </div>
  );
}

function Slider({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (n: number) => void }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5"><span className="text-[12.5px] text-text-2">{label}</span><span className="text-[13px] font-semibold font-mono">{value} <span className="text-[11px] text-text-3 font-normal">{suffix}</span></span></div>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[color:var(--primary)]" aria-label={label} />
    </div>
  );
}
function Legend({ tone, label }: { tone: 'info' | 'success' | 'progress'; label: string }) {
  return <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: toneVar(tone) }} />{label}</span>;
}

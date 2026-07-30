'use client';

import { useState } from 'react';
import { TrendingUp, TrendingDown, Banknote, Gauge, Target, Wallet, Info } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { fmtM } from '@/domain/construction';

export type EvmView = {
  projectId: string; name: string; code: string;
  bac: number; pv: number; ev: number; ac: number; cv: number; sv: number;
  cpi: number; spi: number; eac: number; etc: number; vac: number; tcpi: number;
  costBand: Tone; scheduleBand: Tone;
  curve: { label: string; pv: number; ev: number; ac: number; forecast: number }[];
  nowFrac: number;
  cashByMonth: { label: string; minor: number }[];
  codes: { code: string; name: string; budget: number; committed: number; actual: number; earnedPercent: number; plannedPercent: number; variance: number }[];
  forecastFinishISO: string; slipDays: number; plannedFinishISO: string;
};

const naira = (m: number) => `₦${fmtM(m)}`;

export function EvmCockpit({ views }: { views: EvmView[] }) {
  const [idx, setIdx] = useState(0);
  const [method, setMethod] = useState<'cpi' | 'recover'>('cpi');
  const v = views[idx];
  if (!v) return <div className="text-[13px] text-text-3">No projects.</div>;

  // What-if: "CPI holds" = BAC/CPI (classic). "Productivity recovers" = AC + (BAC−EV).
  const eac = method === 'cpi' ? v.eac : v.ac + (v.bac - v.ev);
  const vac = v.bac - eac;
  const etc = Math.max(0, eac - v.ac);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Project switcher */}
      <div className="flex items-center gap-2 flex-wrap">
        {views.map((x, i) => (
          <button key={x.projectId} onClick={() => setIdx(i)} className="text-[12px] px-3 h-9 rounded-xl border font-medium transition-colors" style={i === idx ? { borderColor: 'transparent', background: `color-mix(in srgb, ${toneVar('progress')} 15%, transparent)`, color: toneVar('progress') } : { borderColor: 'var(--border-2)', background: 'var(--surface)' }}>{x.name}</button>
        ))}
      </div>

      {/* Hero verdict */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#04140f 0%,#0a2b20 55%,#0f4230 100%)' }}>
        <div className="relative flex items-center gap-5 flex-wrap">
          <div className="flex gap-3">
            <IndexRing label="CPI" value={v.cpi} band={v.costBand} />
            <IndexRing label="SPI" value={v.spi} band={v.scheduleBand} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70 flex items-center gap-1.5"><Gauge size={12} /> EARNED VALUE · {v.code}</div>
            <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-1">
              {vac < 0 ? <>Forecast to overrun by <span style={{ color: toneVar('danger') }}>{naira(-vac)}</span></> : <>Forecast under budget by <span style={{ color: toneVar('success') }}>{naira(vac)}</span></>}
            </div>
            <div className="text-[12.5px] text-white/75 mt-0.5">
              Earned {naira(v.ev)} for {naira(v.ac)} spent · finish {v.forecastFinishISO}{v.slipDays > 0 ? ` (${v.slipDays}d late vs ${v.plannedFinishISO})` : ' (on plan)'}
            </div>
          </div>
        </div>
      </div>

      {/* EVM suite */}
      <div className="grid grid-cols-2 min-[560px]:grid-cols-4 gap-2.5">
        <Kpi label="Budget (BAC)" value={naira(v.bac)} tone="info" icon={<Wallet size={16} />} />
        <Kpi label="Earned (EV)" value={naira(v.ev)} tone="progress" icon={<Target size={16} />} />
        <Kpi label="Actual (AC)" value={naira(v.ac)} tone={v.ac > v.ev ? 'warn' : 'success'} icon={<Banknote size={16} />} />
        <Kpi label="Forecast (EAC)" value={naira(eac)} tone={vac < 0 ? 'danger' : 'success'} icon={vac < 0 ? <TrendingDown size={16} /> : <TrendingUp size={16} />} />
      </div>
      <div className="grid grid-cols-2 min-[560px]:grid-cols-4 gap-2.5">
        <Stat label="Cost variance (CV)" value={`${v.cv < 0 ? '−' : '+'}${naira(Math.abs(v.cv))}`} tone={v.cv < 0 ? 'danger' : 'success'} note={v.cv < 0 ? 'spending above value earned' : 'earning above spend'} />
        <Stat label="Schedule variance (SV)" value={`${v.sv < 0 ? '−' : '+'}${naira(Math.abs(v.sv))}`} tone={v.sv < 0 ? 'danger' : 'success'} note={v.sv < 0 ? 'behind the baseline' : 'ahead of baseline'} />
        <Stat label="To complete (ETC)" value={naira(etc)} tone="progress" note="remaining cost to finish" />
        <Stat label="TCPI" value={v.tcpi.toFixed(2)} tone={v.tcpi > 1.1 ? 'danger' : v.tcpi > 1 ? 'warn' : 'success'} note={v.tcpi > 1 ? `need ${v.tcpi.toFixed(2)}× efficiency` : 'achievable at current pace'} />
      </div>

      {/* S-curve */}
      <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          <span className="text-[12.5px] font-semibold">S-curve · planned vs earned vs actual</span>
          <span className="ml-auto flex items-center gap-1 rounded-lg border border-border-2 p-0.5">
            {([['cpi', 'If CPI holds'], ['recover', 'If productivity recovers']] as const).map(([k, label]) => (
              <button key={k} onClick={() => setMethod(k)} className="text-[11px] px-2 h-7 rounded-md font-medium" style={method === k ? { background: `color-mix(in srgb, ${toneVar('progress')} 15%, transparent)`, color: toneVar('progress') } : { color: 'var(--text-3)' }}>{label}</button>
            ))}
          </span>
        </div>
        <p className="text-[10.5px] text-text-3 mb-3">Deterministic forecast — no model, just the two standard EAC formulas. Toggle to compare.</p>
        <SCurve curve={v.curve} nowFrac={v.nowFrac} eac={eac} bac={v.bac} />
        <div className="flex gap-4 text-[11px] text-text-3 mt-2.5 flex-wrap">
          <Legend color="var(--border-2)" dashed label="Planned value (PV)" />
          <Legend color={toneVar('progress')} label="Earned value (EV)" />
          <Legend color={toneVar('warn')} label="Actual cost (AC)" />
          <Legend color={toneVar(vac < 0 ? 'danger' : 'success')} dashed label={`Forecast to ${naira(eac)}`} />
        </div>
      </section>

      <div className="grid grid-cols-1 min-[900px]:grid-cols-[1fr_320px] gap-3.5 items-start">
        {/* Cost codes */}
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border text-[12.5px] font-semibold">Budget vs committed vs actual · by cost code</div>
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm min-w-[560px]">
              <thead><tr>{['Cost code', 'Budget', 'Committed', 'Actual', 'Variance'].map((h, i) => <th key={h} className={`text-[10px] font-semibold uppercase text-text-3 px-4 py-2.5 border-b border-border ${i === 0 ? 'text-left' : 'text-right'}`}>{h}</th>)}</tr></thead>
              <tbody>
                {v.codes.map((c) => (
                  <tr key={c.code} className="hover:bg-surface-2">
                    <td className="px-4 py-2.5 border-b border-border"><div className="text-[12.5px] font-medium">{c.name}</div><div className="text-[10.5px] text-text-3 font-mono">{c.code} · {c.earnedPercent}% earned</div></td>
                    <td className="px-4 py-2.5 border-b border-border text-right text-[12px] font-mono">{naira(c.budget)}</td>
                    <td className="px-4 py-2.5 border-b border-border text-right text-[12px] font-mono text-text-3">{naira(c.committed)}</td>
                    <td className="px-4 py-2.5 border-b border-border text-right text-[12px] font-mono">{naira(c.actual)}</td>
                    <td className="px-4 py-2.5 border-b border-border text-right"><span className="text-[11.5px] font-semibold font-mono" style={{ color: toneVar(c.variance < 0 ? 'danger' : 'success') }}>{c.variance < 0 ? '−' : '+'}{naira(Math.abs(c.variance))}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Cash requirement */}
        <section className="bg-surface border border-border rounded-2xl shadow-card p-4">
          <div className="text-[12.5px] font-semibold mb-1">Cash requirement</div>
          <p className="text-[10.5px] text-text-3 mb-3">Drawn from open purchase orders — what finance must fund.</p>
          <div className="flex flex-col gap-2">
            {v.cashByMonth.map((m) => {
              const max = Math.max(1, ...v.cashByMonth.map((x) => x.minor));
              return (
                <div key={m.label}>
                  <div className="flex justify-between text-[11px] mb-0.5"><span className="text-text-2">{m.label}</span><span className="font-mono text-text-3">{naira(m.minor)}</span></div>
                  <div className="h-2 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(m.minor / max) * 100}%`, background: toneVar('progress') }} /></div>
                </div>
              );
            })}
            {v.cashByMonth.length === 0 && <p className="text-[12px] text-text-3">No open commitments.</p>}
          </div>
          <div className="mt-3 pt-3 border-t border-border text-[11px] text-text-3 flex items-start gap-1.5"><Info size={12} className="mt-0.5 flex-none" /> EAC/VAC are estimates from the standard PMI formulas against the pinned clock — not financial advice.</div>
        </section>
      </div>
    </div>
  );
}

/** Planned/earned/actual cumulative curves + a forecast tail, all inline SVG. */
function SCurve({ curve, nowFrac, eac, bac }: { curve: EvmView['curve']; nowFrac: number; eac: number; bac: number }) {
  const w = 640, h = 180, pad = 4;
  const max = Math.max(bac, eac, 1);
  const x = (i: number) => pad + (i / (curve.length - 1)) * (w - pad * 2);
  const y = (val: number) => h - pad - (val / max) * (h - pad * 2);
  const line = (key: 'pv' | 'ev' | 'ac', upto?: number) => curve.filter((_, i) => upto === undefined || i <= upto).map((c, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(c[key])}`).join(' ');
  const nowIdx = Math.round(nowFrac * (curve.length - 1));
  const forecast = curve.map((c, i) => ({ c, i })).filter(({ i }) => i >= nowIdx).map(({ c, i }, k) => `${k === 0 ? 'M' : 'L'}${x(i)},${y(c.forecast || (i === nowIdx ? curve[nowIdx].ac : 0))}`).join(' ');
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full min-w-[420px]" style={{ height: h }}>
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1={pad} x2={w - pad} y1={y(max * f)} y2={y(max * f)} stroke="var(--border)" strokeWidth="1" />)}
        <line x1={x(nowIdx)} x2={x(nowIdx)} y1={pad} y2={h - pad} stroke="var(--text-3)" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
        <path d={line('pv')} fill="none" stroke="var(--border-2)" strokeWidth="2" strokeDasharray="5 3" />
        <path d={forecast} fill="none" stroke={toneVar(eac > bac ? 'danger' : 'success')} strokeWidth="2" strokeDasharray="4 3" />
        <path d={line('ac', nowIdx)} fill="none" stroke={toneVar('warn')} strokeWidth="2.5" strokeLinecap="round" />
        <path d={line('ev', nowIdx)} fill="none" stroke={toneVar('progress')} strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={x(nowIdx)} cy={y(curve[nowIdx]?.ev ?? 0)} r="3.5" fill={toneVar('progress')} />
        <text x={x(nowIdx) + 5} y={pad + 11} fontSize="9" fill="var(--text-3)">today</text>
      </svg>
    </div>
  );
}
function Legend({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return <span className="inline-flex items-center gap-1.5"><span className="w-4 h-0.5 rounded" style={{ background: dashed ? `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` : color }} />{label}</span>;
}
function IndexRing({ label, value, band }: { label: string; value: number; band: Tone }) {
  const color = toneVar(band);
  const pct = Math.max(0, Math.min(1, value / 1.2));
  return (
    <div className="relative flex-none" style={{ width: 72, height: 72 }}>
      <svg width={72} height={72} viewBox="0 0 36 36" className="-rotate-90"><circle cx="18" cy="18" r="15.5" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="3" /><circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${pct * 97.4} 97.4`} /></svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-[16px] font-bold leading-none" style={{ color }}>{value.toFixed(2)}</span><span className="text-[8px] text-white/60 uppercase tracking-wide mt-0.5">{label}</span></div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}
function Stat({ label, value, tone, note }: { label: string; value: string; tone: Tone; note: string }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><div className="text-[11px] text-text-3 font-medium">{label}</div><div className="text-[16px] font-bold tracking-[-0.02em] leading-none mt-1 font-mono" style={{ color: toneVar(tone) }}>{value}</div><div className="text-[10px] text-text-3 mt-1">{note}</div></div>;
}

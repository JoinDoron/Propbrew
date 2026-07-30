'use client';

import { Trophy, TrendingUp, ShieldCheck, Hammer, Medal, Info } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { fmtM } from '@/domain/construction';

export type LeagueRow = {
  id: string; name: string; trade: string; rank: number; score: number; band: Tone;
  deliveryPct: number; qualityScore: number; safetyScore: number;
  tasksCompleted: number; tasksOnTime: number; defects: number; reworkMinor: number;
  safetyIncidents: number; crewSize: number; valueMinor: number; projects: string[];
};

const naira = (m: number) => `₦${fmtM(m)}`;
const MEDAL = ['#fbbf24', '#cbd5e1', '#d97757'];

export function LeagueWorkspace({ rows, kpis }: {
  rows: LeagueRow[];
  kpis: { subs: number; avgScore: number; totalValueMinor: number; reworkMinor: number };
}) {
  const top = rows[0];

  return (
    <div className="flex flex-col gap-3.5">
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#1a1405 0%,#33280b 55%,#4d3c11 100%)' }}>
        <div className="relative flex items-center gap-2 flex-wrap">
          <span className="w-12 h-12 rounded-2xl grid place-items-center flex-none" style={{ background: 'rgba(255,255,255,.1)' }}><Trophy size={22} /></span>
          <div className="min-w-0">
            <div className="text-[11px] text-white/70">SUBCONTRACTOR LEAGUE</div>
            <div className="text-[20px] font-bold tracking-[-0.02em] leading-tight mt-0.5">{top ? `${top.name} leads on ${top.score}` : 'No subcontractors yet'}</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{kpis.subs} firms · {naira(kpis.totalValueMinor)} of subcontracted work · {naira(kpis.reworkMinor)} lost to rework</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Subcontractors" value={String(kpis.subs)} tone="info" icon={<Hammer size={16} />} />
        <Kpi label="Average score" value={String(kpis.avgScore)} tone={kpis.avgScore >= 80 ? 'success' : 'warn'} icon={<TrendingUp size={16} />} />
        <Kpi label="Work let" value={naira(kpis.totalValueMinor)} tone="progress" icon={<Trophy size={16} />} />
        <Kpi label="Rework cost" value={naira(kpis.reworkMinor)} tone={kpis.reworkMinor > 0 ? 'danger' : 'success'} icon={<ShieldCheck size={16} />} />
      </div>

      <div className="px-1 text-[11px] text-text-3 flex items-start gap-1.5">
        <Info size={12} className="mt-0.5 flex-none" /> Score = delivery 45% (tasks finished on time) + quality 30% (defects per task) + safety 25% (recorded incidents). Same formula for every trade, so a firm can audit its own number.
      </div>

      <div className="flex flex-col gap-2.5">
        {rows.map((r) => (
          <section key={r.id} className="bg-surface border rounded-2xl shadow-card p-4" style={{ borderColor: r.rank <= 3 ? `color-mix(in srgb, ${MEDAL[r.rank - 1]} 40%, transparent)` : 'var(--border)' }}>
            <div className="flex items-start justify-between gap-2 flex-wrap">
              <div className="min-w-0 flex items-start gap-3">
                <span className="w-9 h-9 rounded-xl grid place-items-center flex-none font-bold text-[14px]" style={{ background: r.rank <= 3 ? `color-mix(in srgb, ${MEDAL[r.rank - 1]} 18%, transparent)` : 'var(--surface-2)', color: r.rank <= 3 ? MEDAL[r.rank - 1] : 'var(--text-3)' }}>
                  {r.rank <= 3 ? <Medal size={17} /> : r.rank}
                </span>
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold truncate">{r.name}</div>
                  <div className="text-[11px] text-text-3">{r.trade} · {r.crewSize} crew · {naira(r.valueMinor)} let · {r.projects.join(', ')}</div>
                </div>
              </div>
              <div className="text-right flex-none">
                <div className="text-[22px] font-bold tracking-[-0.02em] leading-none" style={{ color: toneVar(r.band) }}>{r.score}</div>
                <div className="text-[9.5px] text-text-3 mt-0.5">composite</div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3 mt-3">
              <Metric label="Delivery" value={`${r.deliveryPct}%`} detail={`${r.tasksOnTime}/${r.tasksCompleted} on time`} score={r.deliveryPct} />
              <Metric label="Quality" value={String(r.qualityScore)} detail={r.defects ? `${r.defects} defects · ${naira(r.reworkMinor)} rework` : 'no defects'} score={r.qualityScore} />
              <Metric label="Safety" value={String(r.safetyScore)} detail={r.safetyIncidents ? `${r.safetyIncidents} incident${r.safetyIncidents === 1 ? '' : 's'}` : 'clean record'} score={r.safetyScore} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value, detail, score }: { label: string; value: string; detail: string; score: number }) {
  const tone: Tone = score >= 85 ? 'success' : score >= 70 ? 'warn' : 'danger';
  return (
    <div>
      <div className="flex justify-between text-[10px] uppercase tracking-wide text-text-3 mb-1"><span>{label}</span><span className="font-mono font-semibold" style={{ color: toneVar(tone) }}>{value}</span></div>
      <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.min(100, score)}%`, background: toneVar(tone) }} /></div>
      <div className="text-[10px] text-text-3 mt-1 truncate">{detail}</div>
    </div>
  );
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}

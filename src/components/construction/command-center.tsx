'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HardHat, TriangleAlert, Truck, Users, Banknote, ChevronRight, Check, Activity, ArrowRight } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { RISK_LABEL, fmtM, type RiskKind } from '@/domain/construction';
import { acknowledgeSignal } from '@/server/actions/construction';

export type SignalRow = { id: string; kind: RiskKind; projectName: string; severity: Tone; confidence: number; title: string; evidence: string; recommendation: string; nairaAtRiskMinor: number; href: string; state?: string };
export type ProjectRow = { id: string; name: string; code: string; status: string; percentComplete: number; plannedPercent: number; cpi: number; spi: number; costBand: Tone; scheduleBand: Tone; eacMinor: number; bacMinor: number; curve: { pv: number; ev: number }[]; onSite: number; planned: number; forecastFinishISO: string; slipDays: number };
export type DeliveryRow = { ref: string; item: string; vendorName: string; expectedISO: string; qty: number; deliveredQty: number; unit: string; late: boolean };

const naira = (m: number) => `₦${fmtM(m)}`;

export function CommandCenter({ confidence, projects, signals, deliveries, kpis, canMutate }: {
  confidence: { score: number; band: Tone; label: string; nairaAtRiskMinor: number };
  projects: ProjectRow[]; signals: SignalRow[]; deliveries: { late: DeliveryRow[]; today: DeliveryRow[]; upcoming: DeliveryRow[] };
  kpis: { activeProjects: number; onSite: number; plannedCrew: number; openPoValueMinor: number; criticalSignals: number };
  canMutate: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const ack = (id: string) => start(async () => { const r = await acknowledgeSignal(id); if (r.ok) { router.refresh(); flash('Signal acknowledged'); } else flash(r.error); });

  const live = signals.filter((s) => s.state !== 'dismissed' && s.state !== 'snoozed');

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#1a1206 0%,#2f2410 55%,#463414 100%)' }}>
        <div className="absolute -right-12 -top-12 w-64 h-64 rounded-full opacity-20" style={{ background: `radial-gradient(circle, ${toneVar(confidence.band)}, transparent 70%)` }} />
        <div className="relative flex items-center gap-5 flex-wrap">
          <Ring score={confidence.score} band={confidence.band} label="confidence" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[11px] text-white/70">
              <HardHat size={12} /> CONSTRUCTION · PORTFOLIO ·
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#fbbf24] opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-[#fbbf24]" /></span> live
            </div>
            <div className="text-[21px] font-bold tracking-[-0.02em] leading-tight mt-1">Delivery confidence · <span style={{ color: toneVar(confidence.band) }}>{confidence.label}</span></div>
            <div className="text-[12.5px] text-white/75 mt-0.5">{kpis.activeProjects} active project{kpis.activeProjects === 1 ? '' : 's'} · {kpis.onSite}/{kpis.plannedCrew} crew on site · <span className="font-semibold" style={{ color: toneVar('warn') }}>{naira(confidence.nairaAtRiskMinor)} at risk</span></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Active projects" value={String(kpis.activeProjects)} tone="info" icon={<HardHat size={16} />} />
        <Kpi label="Crew on site" value={`${kpis.onSite}/${kpis.plannedCrew}`} tone={kpis.onSite >= kpis.plannedCrew ? 'success' : 'warn'} icon={<Users size={16} />} />
        <Kpi label="Open PO value" value={naira(kpis.openPoValueMinor)} tone="progress" icon={<Banknote size={16} />} />
        <Kpi label="Critical signals" value={String(kpis.criticalSignals)} tone={kpis.criticalSignals ? 'danger' : 'success'} icon={<TriangleAlert size={16} />} />
      </div>

      <div className="grid grid-cols-1 min-[980px]:grid-cols-[1fr_340px] gap-3.5 items-start">
        {/* Projects */}
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Activity size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Projects</span><Link href="/construction/projects" className="ml-auto text-[11px] text-primary font-medium">Register →</Link></div>
          <div className="divide-y divide-border">
            {projects.map((p) => (
              <div key={p.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold truncate">{p.name} <span className="text-[10.5px] text-text-3 font-mono font-normal">{p.code}</span></div>
                    <div className="text-[11px] text-text-3">{p.percentComplete}% complete vs {p.plannedPercent}% plan · {p.onSite}/{p.planned} on site{p.slipDays > 0 ? ` · forecast ${p.forecastFinishISO} (+${p.slipDays}d)` : ''}</div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-none">
                    <Chip label={`CPI ${p.cpi}`} tone={p.costBand} />
                    <Chip label={`SPI ${p.spi}`} tone={p.scheduleBand} />
                  </div>
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <Spark curve={p.curve} />
                  <div className="text-[10.5px] text-text-3 flex-none">EAC {naira(p.eacMinor)} <span className="text-text-3">/ BAC {naira(p.bacMinor)}</span></div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Delivery radar */}
        <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border flex items-center gap-2"><Truck size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">Delivery radar</span><Link href="/construction/procurement" className="ml-auto text-[11px] text-primary font-medium">All →</Link></div>
          <div className="divide-y divide-border">
            {[...deliveries.late.map((d) => ({ d, tag: 'late' as const })), ...deliveries.today.map((d) => ({ d, tag: 'today' as const })), ...deliveries.upcoming.slice(0, 3).map((d) => ({ d, tag: 'due' as const }))].map(({ d, tag }) => (
              <div key={d.ref} className="px-4 py-2.5 flex items-center gap-2" style={tag === 'late' ? { background: 'color-mix(in srgb, var(--tone-danger) 5%, transparent)' } : undefined}>
                <span className="w-7 h-7 rounded-lg grid place-items-center flex-none" style={{ background: `color-mix(in srgb, ${toneVar(tag === 'late' ? 'danger' : tag === 'today' ? 'progress' : 'info')} 13%, transparent)`, color: toneVar(tag === 'late' ? 'danger' : tag === 'today' ? 'progress' : 'info') }}><Truck size={14} /></span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] font-medium truncate">{d.item}</div>
                  <div className="text-[10.5px] text-text-3 truncate"><span className="font-mono">{d.ref}</span> · {d.vendorName} · {d.deliveredQty}/{d.qty} {d.unit}</div>
                </div>
                <span className="text-[10px] font-semibold px-1.5 h-5 inline-flex items-center rounded-full flex-none" style={{ background: `color-mix(in srgb, ${toneVar(tag === 'late' ? 'danger' : 'info')} 14%, transparent)`, color: toneVar(tag === 'late' ? 'danger' : 'info') }}>{tag === 'late' ? 'late' : d.expectedISO.slice(5)}</span>
              </div>
            ))}
            {deliveries.late.length + deliveries.today.length + deliveries.upcoming.length === 0 && <div className="px-4 py-6 text-center text-[12.5px] text-text-3">No open deliveries.</div>}
          </div>
        </section>
      </div>

      {/* Attention feed */}
      <section className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <TriangleAlert size={14} className="text-text-3" /><span className="text-[12.5px] font-semibold">What needs you today</span>
          <span className="text-[10.5px] text-text-3">· ranked by ₦ at risk · advisory</span>
          <Link href="/construction/risk" className="ml-auto text-[11px] text-primary font-medium">Risk radar →</Link>
        </div>
        <div className="divide-y divide-border">
          {live.slice(0, 7).map((s) => (
            <div key={s.id} className={`px-4 py-3 ${s.state === 'ack' ? 'opacity-55' : ''}`}>
              <div className="flex items-start gap-2.5">
                <span className="w-2 h-2 rounded-full mt-1.5 flex-none" style={{ background: toneVar(s.severity) }} />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-medium flex items-center gap-1.5 flex-wrap">
                    {s.title}
                    <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(s.severity)} 14%, transparent)`, color: toneVar(s.severity) }}>{RISK_LABEL[s.kind]}</span>
                    {s.nairaAtRiskMinor > 0 && <span className="text-[10px] font-semibold" style={{ color: toneVar('warn') }}>{naira(s.nairaAtRiskMinor)}</span>}
                  </div>
                  <div className="text-[11.5px] text-text-3 mt-0.5">{s.evidence}</div>
                  <div className="text-[11px] mt-1" style={{ color: toneVar('info') }}>→ {s.recommendation}</div>
                </div>
                <div className="flex items-center gap-1.5 flex-none">
                  <span className="text-[9.5px] text-text-3" title="Deterministic heuristic confidence">{Math.round(s.confidence * 100)}%</span>
                  <Link href={s.href} className="w-7 h-7 rounded-lg grid place-items-center border border-border-2" title="Open source"><ChevronRight size={13} /></Link>
                  {canMutate && s.state !== 'ack' && <button disabled={pending} onClick={() => ack(s.id)} className="text-[11px] px-2 h-7 rounded-lg border border-border-2 inline-flex items-center gap-1 disabled:opacity-50"><Check size={11} /> Ack</button>}
                </div>
              </div>
            </div>
          ))}
          {live.length === 0 && <div className="px-4 py-8 text-center text-[13px] text-text-3">Nothing flagged — all projects tracking to plan.</div>}
        </div>
      </section>

      <div className="flex flex-wrap gap-2">
        {[['Earned value', '/construction/evm'], ['Critical path', '/construction/schedule'], ['Materials & leakage', '/construction/materials'], ['Weekly digest', '/construction/digest']].map(([label, href]) => (
          <Link key={href} href={href} className="text-[12px] px-3 h-9 rounded-xl border border-border-2 bg-surface inline-flex items-center gap-1.5 font-medium">{label} <ArrowRight size={12} /></Link>
        ))}
      </div>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

/** Mini planned-vs-earned S-curve, inline SVG (no chart library). */
function Spark({ curve }: { curve: { pv: number; ev: number }[] }) {
  const w = 150, h = 26;
  const max = Math.max(1, ...curve.map((c) => c.pv));
  const path = (key: 'pv' | 'ev') => curve.map((c, i) => `${i === 0 ? 'M' : 'L'}${(i / (curve.length - 1)) * w},${h - (c[key] / max) * h}`).join(' ');
  return (
    <svg width={w} height={h} className="flex-none overflow-visible">
      <path d={path('pv')} fill="none" stroke="var(--border-2)" strokeWidth="1.5" strokeDasharray="3 2" />
      <path d={path('ev')} fill="none" stroke={toneVar('progress')} strokeWidth="2" strokeLinecap="round" />
    </svg>
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
function Chip({ label, tone }: { label: string; tone: Tone }) {
  return <span className="text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full font-mono" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{label}</span>;
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}

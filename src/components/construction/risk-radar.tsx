'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Radar, ShieldAlert, Check, Clock, ArrowUpRight, X, Banknote, Info } from 'lucide-react';
import { toneVar, type Tone } from '@/lib/status-tones';
import { RISK_LABEL, fmtM, type RiskKind } from '@/domain/construction';
import { acknowledgeSignal, snoozeSignal, dismissSignal, escalateSignalToIssue } from '@/server/actions/construction';

export type RadarSignal = { id: string; kind: RiskKind; projectId: string; projectName: string; severity: Tone; confidence: number; title: string; evidence: string; recommendation: string; nairaAtRiskMinor: number; href: string; state?: string };

const naira = (m: number) => `₦${fmtM(m)}`;
const SEV_ORDER: Tone[] = ['danger', 'warn', 'info'];

export function RiskRadar({ signals, canMutate }: { signals: RadarSignal[]; canMutate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showDismissed, setShowDismissed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2600); };
  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) => start(async () => { const r = await fn(); if (r.ok) { router.refresh(); flash(ok); } else flash(r.error ?? 'Failed'); });

  const visible = signals.filter((s) => showDismissed || (s.state !== 'dismissed' && s.state !== 'snoozed'));
  const totalAtRisk = signals.filter((s) => s.state !== 'dismissed').reduce((n, s) => n + s.nairaAtRiskMinor, 0);
  const byKind = new Map<RiskKind, number>();
  for (const s of visible) byKind.set(s.kind, (byKind.get(s.kind) ?? 0) + 1);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Hero + radar */}
      <div className="relative overflow-hidden rounded-2xl p-5 text-white shadow-card" style={{ background: 'linear-gradient(135deg,#1b0713 0%,#340f22 55%,#4d1630 100%)' }}>
        <div className="relative flex items-center gap-6 flex-wrap">
          <RadarPlot signals={visible} />
          <div className="min-w-0">
            <div className="text-[11px] text-white/70 flex items-center gap-1.5"><Radar size={12} /> RISK RADAR · ADVISORY</div>
            <div className="text-[21px] font-bold tracking-[-0.02em] leading-tight mt-1">{visible.filter((s) => s.severity === 'danger').length} critical · {visible.filter((s) => s.severity === 'warn').length} watch</div>
            <div className="text-[12.5px] text-white/75 mt-0.5">Up to <span className="font-semibold" style={{ color: toneVar('warn') }}>{naira(totalAtRisk)}</span> exposed across the portfolio</div>
            <div className="text-[11px] text-white/50 mt-1.5 max-w-[420px]">Deterministic detectors — every signal shows its evidence and confidence. Recommendations require your judgement; nothing acts on its own.</div>
          </div>
        </div>
      </div>

      {/* Detector legend */}
      <div className="flex flex-wrap gap-1.5">
        {[...byKind.entries()].sort((a, b) => b[1] - a[1]).map(([kind, n]) => (
          <span key={kind} className="text-[11px] px-2.5 h-7 inline-flex items-center gap-1.5 rounded-full border border-border-2 bg-surface font-medium">{RISK_LABEL[kind]} <span className="text-text-3">{n}</span></span>
        ))}
        <button onClick={() => setShowDismissed((v) => !v)} className="ml-auto text-[11px] px-2.5 h-7 rounded-full border border-border-2 bg-surface font-medium text-text-3">{showDismissed ? 'Hide' : 'Show'} snoozed/dismissed</button>
      </div>

      {/* Signals */}
      <div className="flex flex-col gap-2.5">
        {SEV_ORDER.map((sev) => {
          const group = visible.filter((s) => s.severity === sev);
          if (group.length === 0) return null;
          return (
            <div key={sev}>
              <div className="text-[11px] font-semibold uppercase tracking-wide mb-1.5" style={{ color: toneVar(sev) }}>{sev === 'danger' ? 'Critical' : sev === 'warn' ? 'Watch' : 'Informational'}</div>
              <div className="flex flex-col gap-2">
                {group.map((s) => (
                  <div key={s.id} className={`bg-surface border rounded-2xl shadow-card p-4 ${s.state === 'dismissed' || s.state === 'snoozed' ? 'opacity-50' : ''}`} style={{ borderColor: s.severity === 'danger' ? 'color-mix(in srgb, var(--tone-danger) 35%, transparent)' : 'var(--border)' }}>
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full" style={{ background: `color-mix(in srgb, ${toneVar(s.severity)} 14%, transparent)`, color: toneVar(s.severity) }}>{RISK_LABEL[s.kind]}</span>
                          <span className="text-[10.5px] text-text-3">{s.projectName}</span>
                          {s.state && <span className="text-[9.5px] font-semibold px-1.5 h-4 inline-flex items-center rounded-full bg-surface-2 text-text-3 capitalize">{s.state}</span>}
                        </div>
                        <div className="text-[14px] font-semibold mt-1">{s.title}</div>
                        <div className="text-[11.5px] text-text-3 mt-0.5 max-w-[620px]">{s.evidence}</div>
                        <div className="text-[11.5px] mt-1.5 flex items-start gap-1.5" style={{ color: toneVar('info') }}><ArrowUpRight size={13} className="mt-px flex-none" /> {s.recommendation}</div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-none">
                        {s.nairaAtRiskMinor > 0 && <span className="text-[13px] font-bold" style={{ color: toneVar('warn') }}><Banknote size={12} className="inline mr-1" />{naira(s.nairaAtRiskMinor)}</span>}
                        <ConfidenceBar value={s.confidence} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 flex-wrap">
                      <Link href={s.href} className="text-[11.5px] px-2.5 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1 font-medium">Open source</Link>
                      {canMutate && s.state !== 'ack' && <button disabled={pending} onClick={() => act(() => acknowledgeSignal(s.id), 'Acknowledged')} className="text-[11.5px] px-2.5 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1 disabled:opacity-50"><Check size={12} /> Acknowledge</button>}
                      {canMutate && <button disabled={pending} onClick={() => act(() => snoozeSignal(s.id), 'Snoozed')} className="text-[11.5px] px-2.5 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1 disabled:opacity-50"><Clock size={12} /> Snooze</button>}
                      {canMutate && <button disabled={pending} onClick={() => act(() => dismissSignal(s.id), 'Dismissed')} className="text-[11.5px] px-2.5 h-8 rounded-lg border border-border-2 inline-flex items-center gap-1 text-text-3 disabled:opacity-50"><X size={12} /> Dismiss</button>}
                      {canMutate && s.state !== 'escalated' && <button disabled={pending} onClick={() => act(() => escalateSignalToIssue(s.id, s.projectId, s.title), 'Escalated to a site issue')} className="ml-auto text-[11.5px] px-2.5 h-8 rounded-lg bg-primary text-white font-medium inline-flex items-center gap-1 disabled:opacity-50"><ShieldAlert size={12} /> Escalate to issue</button>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {visible.length === 0 && <div className="bg-surface border border-border rounded-2xl p-10 text-center text-[13px] text-text-3">No live signals — every detector is quiet.</div>}
      </div>

      <div className="text-[11px] text-text-3 flex items-start gap-1.5"><Info size={12} className="mt-0.5 flex-none" /> Signals are computed from your own records by fixed rules (no model). Confidence reflects how strongly the evidence matches the pattern — it is not a probability of failure.</div>

      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

/** Concentric radar: angle = detector kind, radius = severity, dot size = ₦ at risk. */
function RadarPlot({ signals }: { signals: RadarSignal[] }) {
  const size = 150, c = size / 2, rMax = c - 12;
  const kinds = [...new Set(signals.map((s) => s.kind))];
  const radiusFor = (sev: Tone) => sev === 'danger' ? rMax : sev === 'warn' ? rMax * 0.66 : rMax * 0.36;
  const maxNaira = Math.max(1, ...signals.map((s) => s.nairaAtRiskMinor));
  return (
    <svg width={size} height={size} className="flex-none">
      {[0.36, 0.66, 1].map((f, i) => <circle key={f} cx={c} cy={c} r={rMax * f} fill="none" stroke="rgba(255,255,255,.13)" strokeWidth="1" strokeDasharray={i === 2 ? undefined : '3 3'} />)}
      {kinds.map((_, i) => { const a = (i / Math.max(1, kinds.length)) * Math.PI * 2 - Math.PI / 2; return <line key={i} x1={c} y1={c} x2={c + Math.cos(a) * rMax} y2={c + Math.sin(a) * rMax} stroke="rgba(255,255,255,.08)" strokeWidth="1" />; })}
      {signals.map((s, i) => {
        const ki = kinds.indexOf(s.kind);
        const spread = signals.filter((x) => x.kind === s.kind).indexOf(s);
        const a = ((ki + spread * 0.18) / Math.max(1, kinds.length)) * Math.PI * 2 - Math.PI / 2;
        const r = radiusFor(s.severity);
        const dot = 2.5 + (s.nairaAtRiskMinor / maxNaira) * 4;
        return <circle key={s.id + i} cx={c + Math.cos(a) * r} cy={c + Math.sin(a) * r} r={dot} fill={toneVar(s.severity)} opacity={s.state === 'dismissed' ? 0.3 : 0.9} className="animate-fade" />;
      })}
      <circle cx={c} cy={c} r="3" fill="rgba(255,255,255,.5)" />
    </svg>
  );
}
function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="flex items-center gap-1.5" title={`Deterministic confidence: how strongly the evidence matches this detector's pattern (${pct}%)`}>
      <div className="w-14 h-1.5 rounded-full bg-surface-2 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: toneVar(pct >= 80 ? 'success' : pct >= 60 ? 'warn' : 'muted') }} /></div>
      <span className="text-[10px] text-text-3 font-mono">{pct}%</span>
    </div>
  );
}

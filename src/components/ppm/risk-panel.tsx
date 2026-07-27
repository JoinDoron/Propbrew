'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Info, Sparkles } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';
import { toneVar, type Tone } from '@/lib/status-tones';
import { decidePpmSuggestion } from '@/server/actions/ppm';
import type { PpmData, RiskView } from './types';

const BAND_TONE: Record<string, Tone> = { critical: 'danger', elevated: 'warn', healthy: 'success' };

export function RiskPanel({ data }: { data: PpmData }) {
  const ranked = data.assessments;
  const [selId, setSelId] = useState<string | null>(ranked[0] ? String(ranked[0].assetId) : null);
  const sel = ranked.find((a) => String(a.assetId) === selId) ?? ranked[0] ?? null;

  return (
    <div className="grid min-[900px]:grid-cols-[minmax(0,1fr)_380px] gap-3.5 items-start">
      {/* Ranked list */}
      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="px-4 py-2.5 border-b border-border flex items-center gap-2">
          <Sparkles size={14} className="text-primary" />
          <span className="text-[12.5px] font-semibold">Failure risk — ranked by AI-F-01</span>
          <span className="text-[11px] text-text-3 ml-auto">deterministic · scoped to your estates</span>
        </div>
        {ranked.map((a) => {
          const active = String(a.assetId) === selId;
          return (
            <button key={String(a.assetId)} onClick={() => setSelId(String(a.assetId))} className={`flex items-center gap-3 w-full text-left px-4 py-3 border-b border-border last:border-0 transition-colors ${active ? 'bg-primary-weak/50' : 'hover:bg-surface-2'}`}>
              <ScoreDial score={a.score} band={a.band} />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold truncate">{a.assetName}</div>
                <div className="text-[11.5px] text-text-3 truncate">Top driver: {driverLabel(a)}</div>
              </div>
              {a.suggestedDate && <span className="text-[10px] font-semibold text-primary bg-primary-weak px-1.5 h-5 rounded inline-flex items-center flex-none">AI</span>}
              <StatusPill status={a.band} tone={BAND_TONE[a.band]} />
            </button>
          );
        })}
      </div>

      {/* Breakdown */}
      {sel && <Breakdown a={sel} canMutate={data.canMutate} />}
    </div>
  );
}

function Breakdown({ a, canMutate }: { a: RiskView; canMutate: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const maxContribution = Math.max(0.48, ...a.drivers.map((d) => d.contribution));

  const decide = (decision: 'approve' | 'override') => {
    setError(null);
    start(async () => {
      const r = await decidePpmSuggestion(String(a.assetId), decision, {
        date: a.suggestedDate,
        confidence: a.confidence,
        driver: a.topDriver,
        reason: decision === 'override' ? 'FM kept the calendar date' : undefined,
      });
      if (!r.ok) setError(r.error);
      else router.refresh();
    });
  };

  return (
    <div className="bg-surface border border-border rounded-2xl shadow-card p-4 min-[900px]:sticky min-[900px]:top-2">
      <div className="flex items-center gap-3">
        <ScoreDial score={a.score} band={a.band} big />
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold truncate">{a.assetName}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusPill status={`${a.band} risk`} tone={BAND_TONE[a.band]} />
            <span className="text-[11px] text-text-3">conf {Math.round(a.confidence * 100)}%</span>
          </div>
        </div>
      </div>

      {/* Six-signal breakdown */}
      <div className="mt-4 flex flex-col gap-2">
        {a.drivers.map((d) => (
          <div key={d.key}>
            <div className="flex items-center justify-between text-[11.5px] mb-0.5">
              <span className="text-text-2">{d.label}</span>
              <span className="text-text-3">{d.value}</span>
            </div>
            <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.round((d.contribution / maxContribution) * 100)}%`, background: toneVar(barTone(d.key, d.contribution)) }} />
            </div>
          </div>
        ))}
      </div>

      {/* AI suggestion (HITL) */}
      {a.suggestedDate ? (
        <div className="mt-4 rounded-[14px] border border-border bg-surface-2 p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-6 h-6 rounded-lg bg-primary-weak text-primary flex items-center justify-center text-[11px] font-bold">AI</span>
            <span className="text-[13px] font-semibold">Suggested pull-forward</span>
            <span className="font-mono text-[10px] text-text-3 ml-auto">AI-F-01</span>
          </div>
          {a.shadow ? (
            <div className="text-[12.5px] text-text-2">
              <span className="inline-flex items-center gap-1 text-warning"><Info size={13} /> Shadow mode</span> — {shadowReason(a)}. The standard calendar is unaffected.
            </div>
          ) : (
            <>
              <p className="text-[13px] text-text-2">
                Bring the next service forward to <strong>{a.suggestedDate}</strong> — {a.suggestReason}.
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <StatusPill status={`${Math.round(a.confidence * 100)}% confidence`} tone={a.confidence >= 0.85 ? 'success' : 'warn'} />
                <span className="text-[11px] text-text-3">Sources: runtime log · WO history · asset register · season</span>
              </div>
              <div className="flex items-center gap-2 mt-3">
                {canMutate ? (
                  <>
                    <Button variant="primary" disabled={pending} onClick={() => decide('approve')} className="!h-8 !text-[12px]">Approve</Button>
                    <Button variant="secondary" disabled={pending} onClick={() => decide('override')} className="!h-8 !text-[12px]">Keep calendar date</Button>
                  </>
                ) : (
                  <span className="text-[11.5px] text-text-3">Read-only — only the Facility Manager can approve.</span>
                )}
                <span className="text-[11px] text-text-3 ml-auto">Review · approve · override</span>
              </div>
            </>
          )}
          {error && <p className="text-[11.5px] text-negative mt-2">{error}</p>}
        </div>
      ) : (
        <p className="mt-4 text-[12px] text-text-3">No pull-forward suggested — this asset’s risk is calendar-driven and already handled by the scheduler.</p>
      )}
    </div>
  );
}

function ScoreDial({ score, band, big }: { score: number; band: string; big?: boolean }) {
  const size = big ? 52 : 38;
  const tone = toneVar(BAND_TONE[band]);
  return (
    <div className="relative flex-none" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 36 36" className="-rotate-90">
        <circle cx="18" cy="18" r="15" fill="none" stroke="var(--surface-3)" strokeWidth="4" />
        <circle cx="18" cy="18" r="15" fill="none" stroke={tone} strokeWidth="4" strokeLinecap="round" strokeDasharray={`${(score / 100) * 94.2} 94.2`} />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono font-bold" style={{ fontSize: big ? 15 : 11, color: tone }}>{score}</span>
    </div>
  );
}

function driverLabel(a: RiskView): string {
  const d = a.drivers.find((x) => x.key === a.topDriver);
  return d ? `${d.label} · ${d.value}` : a.topDriver;
}
function barTone(key: string, contribution: number): Tone {
  if (contribution <= 0) return 'muted';
  return key === 'failure' || key === 'status' ? 'danger' : key === 'runtime' ? 'warn' : 'info';
}
function shadowReason(a: RiskView): string {
  return `only ${Math.round(a.confidence * 4)} of 4 signals present`;
}

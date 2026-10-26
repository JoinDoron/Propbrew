'use client';

import { useState, useTransition } from 'react';
import { FacilityDialog } from '@/components/facility/facility-ui';
import layout from '@/components/ui/workspace-layout.module.css';
import { Card, CardHeader, EmptyState } from '@/components/ui';
import styles from './maintenance-clinexa.module.css';
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
    <div className={styles.riskGrid}>
      {/* Ranked list */}
      <Card padded={false} className="overflow-hidden">
        <div className={styles.header}><CardHeader title="Maintenance risk signals · AI-F-01" subtitle="Deterministic advisory rules · scoped to your estates" action={<Sparkles size={20} className="text-primary" />} /></div>
        {ranked.map((a) => {
          const active = String(a.assetId) === selId;
          return (
            <button key={String(a.assetId)} aria-pressed={active} aria-label={`Review risk signals for ${a.assetName}`} onClick={() => setSelId(String(a.assetId))} className={styles.riskChoice}>
              <ScoreDial score={a.score} band={a.band} />
              <div>
                <div className={styles.heading}>{a.assetName}</div>
                <div className={styles.metadata}>Top driver: {driverLabel(a)}</div>
              </div>
              {a.suggestedDate && <Sparkles size={16} aria-label="Advisory scheduling suggestion available" className="text-primary flex-none" />}
              <StatusPill status={a.band} tone={BAND_TONE[a.band]} />
            </button>
          );
        })}
        {ranked.length === 0 && <EmptyState title="No maintenance risk signals" description="Risk assessments appear when scoped asset signals are available. No failure forecast has been generated." />}
      </Card>

      {/* Breakdown */}
      {sel && <Breakdown a={sel} data={data} canMutate={data.canMutate} />}
    </div>
  );
}

function Breakdown({ a, canMutate, data }: { a: RiskView; canMutate: boolean; data: PpmData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<'approve' | 'override' | null>(null);
  const maxContribution = Math.max(0.48, ...a.drivers.map((d) => d.contribution));

  const decide = (decision: 'approve' | 'override') => { if (pending) return;
    setError(null);
    start(async () => { try {
      const r = await decidePpmSuggestion(String(a.assetId), decision, {
        expectedCompanyId: data.setup?.companyId,
        planId: String(a.planId),
        expectedPlanVersion: data.setup?.plans.find((p) => p.planId === String(a.planId))?.version,
        date: a.suggestedDate,
        confidence: a.confidence,
        driver: a.topDriver,
        reason: decision === 'override' ? 'FM kept the calendar date' : undefined,
      });
      if (!r.ok) setError(r.error);
      else { setReview(null); router.refresh(); }
     } catch { setError('The save could not be confirmed. Your entries are still here; refresh the record before retrying.'); } });
  };

  return (
    <Card className={`${styles.stack} ${styles.riskSummary}`}>
      <div className={styles.inline}>
        <ScoreDial score={a.score} band={a.band} big />
        <div className="min-w-0">
          <h3 className={styles.heading}>{a.assetName}</h3>
          <div className={styles.inline}>
            <StatusPill status={`${a.band} risk`} tone={BAND_TONE[a.band]} />
            <span className="text-[12px] text-text-3">Signal completeness {Math.round(a.confidence * 100)}%</span>
          </div>
        </div>
      </div>

      {/* Six-signal breakdown */}
      <div className={styles.drivers}>
        {a.drivers.map((d) => (
          <div key={d.key}>
            <div className={`${styles.driverLabel} ${styles.text}`}>
              <span className="text-text-2">{d.label}</span>
              <span className="text-text-3">{d.value}</span>
            </div>
            <div className={styles.bar}>
              <div style={{ width: `${Math.round((d.contribution / maxContribution) * 100)}%`, background: toneVar(barTone(d.key, d.contribution)) }} />
            </div>
          </div>
        ))}
      </div>

      {/* AI suggestion (HITL) */}
      {a.suggestedDate ? (
        <Card className={`${styles.stack} ${styles.sectionCard}`}>
          <CardHeader title="Suggested pull-forward" subtitle="AI-F-01 · manager review required" action={<Sparkles size={20} className="text-primary" />} />
          {a.shadow ? (
            <div className={styles.text}>
              <span className="inline-flex items-center gap-1 text-warning"><Info size={16} /> Shadow mode</span> — {shadowReason(a)}. The standard calendar is unaffected.
            </div>
          ) : (
            <>
              <p className={styles.text}>
                Bring the next service forward to <strong>{a.suggestedDate}</strong> — {a.suggestReason}.
              </p>
              <div className={styles.inline}>
                <StatusPill status={`${Math.round(a.confidence * 100)}% signal completeness`} tone={a.confidence >= 0.85 ? 'success' : 'warn'} />
                <span className="text-[12px] text-text-3">Sources: runtime log · WO history · asset register · season</span>
              </div>
              <div className={styles.inline}>
                {canMutate ? (
                  <>
                    <Button variant="primary" disabled={pending} onClick={() => { setError(null); setReview('approve'); }}>Review approval</Button>
                    <Button variant="secondary" disabled={pending} onClick={() => { setError(null); setReview('override'); }}>Keep calendar date</Button>
                  </>
                ) : (
                  <span className="text-[12px] text-text-3">Read-only — only the Facility Manager can approve.</span>
                )}
                <span className={styles.metadata}>Review · approve · override</span>
              </div>
            </>
          )}
          {!review && error && <p role="alert" className="text-[14px] text-negative mt-2">{error}</p>}
        </Card>
      ) : (
        <p className={styles.text}>No pull-forward suggested — this asset’s risk is calendar-driven and already handled by the scheduler.</p>
      )}
      {review && (
        <FacilityDialog title="Review maintenance scheduling decision" onClose={() => setReview(null)} pending={pending}>
          <div className={styles.stack}>
            <p className={layout.title}>{a.assetName}</p>
            <p className={layout.body}>{review === 'approve' ? `Approve the suggested service pull-forward to ${a.suggestedDate}.` : 'Keep the existing calendar date and record an override.'} This is a deterministic advisory rule, not a calibrated probability or certified failure prediction. Confirm against your statutory deadline and resource plan.</p>
            {error && <p role="alert" className="text-[14px] text-negative">{error}</p>}
            <div className={layout.actions}><Button disabled={pending} onClick={() => setReview(null)}>Go back</Button><Button variant="primary" disabled={pending} onClick={() => decide(review)}>{pending ? 'Saving…' : 'Confirm decision'}</Button></div>
          </div>
        </FacilityDialog>
      )}
    </Card>
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
      <span className="absolute inset-0 flex items-center justify-center font-mono font-bold" style={{ fontSize: big ? 16 : 12, color: tone }}>{score}</span>
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

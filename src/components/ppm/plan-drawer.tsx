'use client';

import { useState, useTransition } from 'react';
import { FacilityDialog } from '@/components/facility/facility-ui';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Camera, Check, Lock } from 'lucide-react';
import { Button, Card, CardHeader, StatusPill } from '@/components/ui';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './maintenance-clinexa.module.css';
import { humanizeStatus, type Tone } from '@/lib/status-tones';
import { completePpmOccurrence, generatePpmWorkOrder, reschedulePpmOccurrence } from '@/server/actions/ppm';
import type { OccView, PlanView, RiskView } from './types';

const OCC_TONE: Record<string, Tone> = { scheduled: 'info', overdue: 'danger', wo_generated: 'progress', in_progress: 'progress', completed: 'success', ai_draft: 'muted' };
const BAND_TONE: Record<string, Tone> = { critical: 'danger', elevated: 'warn', healthy: 'success' };

export function PlanDrawer({ occ, plan, risk, canMutate, onClose }: { occ: OccView; plan: PlanView; risk: RiskView | null; canMutate: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // completion state
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [photos, setPhotos] = useState(0);
  const [showComplete, setShowComplete] = useState(false);
  const [reviewComplete, setReviewComplete] = useState(false);
  const [rDate, setRDate] = useState(occ.dueDate);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => { if (pending) return;
    setError(null);
    start(async () => { try {
      const r = await fn();
      if (!r.ok) setError(r.error ?? 'Action failed.');
      else { onClose(); router.refresh(); }
     } catch { setError('The save could not be confirmed. Your entries are still here; refresh the record before retrying.'); } });
  };

  const allChecked = plan.checklist.every((c) => checked.has(c.id));
  const canComplete = allChecked && (!plan.evidenceRequired || photos > 0);

  return (
    <FacilityDialog title={plan.assetName} onClose={onClose} pending={pending} drawer width={640}>
      <div className={styles.stack}>
        <div className={styles.inline}>
              <StatusPill status={humanizeStatus(occ.status)} tone={OCC_TONE[occ.status] ?? 'neutral'} />
              {plan.statutory && <span className={styles.inline}><Lock size={16} className="text-negative" /><StatusPill status="Statutory" tone="danger" /></span>}
              {occ.basisWon === 'runtime' && <StatusPill status="Runtime-driven" tone="warn" />}
        </div>

        <div className={styles.stack}>
          {/* Config */}
          <Card>
          <CardHeader title="Service details" subtitle="Recorded plan configuration and service dates" />
          <dl className={styles.facts}>
            <Fact label="Frequency" value={plan.frequency} />
            <Fact label="Due" value={occ.dueDate} />
            <Fact label="Generate WO" value={occ.generateDate} />
            <Fact label="Lead time" value={`${plan.leadTimeDays} days`} />
            <Fact label="Assignee" value={plan.assignee} />
            <Fact label="Est. labour" value={`${plan.estimatedHours}h`} />
            {plan.statutory && plan.statutoryDeadline && <Fact label="Legal deadline" value={plan.statutoryDeadline} danger />}
            <Fact label="Last serviced" value={plan.lastServicedAt ?? '—'} />
          </dl>
          </Card>

          {risk && (
            <div className={styles.callout}>
              <StatusPill status={`Risk ${risk.score}`} tone={BAND_TONE[risk.band]} />
              <span className={styles.text}>{risk.suggestReason ?? risk.drivers[0]?.value}</span>
            </div>
          )}

          {/* Linked WO */}
          {occ.workOrderRef && (
            <Link href={`/work-orders/${occ.workOrderRef}`} className={styles.link}>
              Linked work order {occ.workOrderRef} →
            </Link>
          )}

          {/* Actions */}
          {canMutate ? (
            <fieldset disabled={pending} className={styles.fieldset}>
              <legend className="sr-only">Maintenance plan actions</legend>
              {!occ.workOrderRef && (
                <Button variant="primary" disabled={pending} onClick={() => run(() => generatePpmWorkOrder(occ.id))}>Generate work order now</Button>
              )}

              {!showComplete ? (
                <Button variant="secondary" disabled={pending} onClick={() => setShowComplete(true)}>Mark serviced…</Button>
              ) : (
                <Card className={`${styles.stack} ${styles.sectionCard}`}>
                  <CardHeader title="Completion checklist" subtitle="Confirm each service item before reviewing completion." />
                  <div className={styles.checklist}>
                    {plan.checklist.map((c) => {
                      const on = checked.has(c.id);
                      return (
                        <Button key={c.id} aria-pressed={on} onClick={() => setChecked((prev) => { const n = new Set(prev); if (n.has(c.id)) n.delete(c.id); else n.add(c.id); return n; })}
                          className={styles.evidence} style={{ justifyContent: 'flex-start' }}>
                          <span className={`w-4 h-4 rounded border flex items-center justify-center flex-none ${on ? 'bg-primary border-primary text-white' : 'border-border-2'}`}>{on && <Check size={11} />}</span>
                          <span className={on ? 'line-through text-text-3' : ''}>{c.label}</span>
                          {c.requiresPhoto && <Camera size={16} className="text-text-3" aria-label="Evidence required" />}
                        </Button>
                      );
                    })}
                  </div>
                  {plan.evidenceRequired && (
                    <Button onClick={() => setPhotos((p) => p + 1)} className={styles.evidence} style={{ justifyContent: 'flex-start' }}>
                      <Camera size={14} className="text-text-3" />
                      {photos > 0 ? `${photos} demo evidence item(s) recorded` : 'Record demo evidence count (required)'}
                    </Button>
                  )}
                  <p className={styles.metadata}>Evidence count is a demo input only. No photo file is uploaded or verified by this control.</p>
                  <Button variant="primary" disabled={pending || !canComplete} onClick={() => setReviewComplete(true)}>
                    {canComplete ? 'Review service completion' : `${plan.checklist.length - checked.size} item(s) left${plan.evidenceRequired && photos === 0 ? ' + evidence' : ''}`}
                  </Button>
                  {reviewComplete && <div className={styles.review}><p className={styles.text}>Confirm the service checklist is complete. This marks the occurrence serviced and advances the maintenance schedule.</p><div className={layout.actions}><Button disabled={pending} onClick={() => setReviewComplete(false)}>Go back</Button><Button variant="primary" disabled={pending || !canComplete} onClick={() => run(() => completePpmOccurrence(occ.id, { checkedIds: [...checked], photoCount: photos }))}>{pending ? 'Saving…' : 'Confirm service completion'}</Button></div></div>}
                </Card>
              )}

              {/* Reschedule */}
              <div className={styles.reschedule}>
                <label className={layout.field}><span className={layout.title}>Reschedule service date</span><input disabled={pending} type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} className={layout.control} /></label>
                <Button variant="secondary" disabled={pending || rDate === occ.dueDate} onClick={() => run(() => reschedulePpmOccurrence(occ.id, rDate))} className="">Reschedule</Button>
              </div>
              {plan.statutory && <p className={styles.metadata}>Statutory — cannot move past {plan.statutoryDeadline}.</p>}
            </fieldset>
          ) : (
            <p className={styles.text}>Read-only — only the Facility Manager can generate, complete or reschedule.</p>
          )}

          {error && <p role="alert" className="text-[14px] text-negative">{error}</p>}
        </div>
      </div>
      </FacilityDialog>
  );
}

function Fact({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={danger ? styles.danger : undefined}>{value}</dd>
    </div>
  );
}

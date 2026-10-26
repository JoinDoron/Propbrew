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
import { EvidencePicker } from '@/components/facility/evidence-picker';
import { recordFacilityService } from '@/server/actions/facility-maintenance-setup';
import type { PpmData, OccView, PlanView, RiskView } from './types';

const OCC_TONE: Record<string, Tone> = { scheduled: 'info', overdue: 'danger', wo_generated: 'progress', in_progress: 'progress', completed: 'success', ai_draft: 'muted' };
const BAND_TONE: Record<string, Tone> = { critical: 'danger', elevated: 'warn', healthy: 'success' };

export function PlanDrawer({ data, occ, plan, risk, canMutate, onClose }: { data?: PpmData; occ: OccView; plan: PlanView; risk: RiskView | null; canMutate: boolean; onClose: () => void }) {
  const router = useRouter();
  const setup = data?.setup, meta = setup?.plans.find((row) => row.planId === plan.id), asset = setup?.assets.find((row) => row.id === plan.assetId);
  const runtime = data?.runtime.find((row) => String(row.assetId) === plan.assetId);
  const [evidenceIds, setEvidenceIds] = useState<string[]>([]);
  const [servicedOn, setServicedOn] = useState(data?.now ?? occ.dueDate);
  const [runtimeAtService, setRuntimeAtService] = useState(String(runtime?.runtimeHours ?? ''));
  const [notes, setNotes] = useState('');
  const [submissionKey] = useState(() => crypto.randomUUID());
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
  const canComplete = allChecked && (setup ? !!meta && !!asset && (!plan.evidenceRequired || evidenceIds.length > 0) : (!plan.evidenceRequired || photos > 0));

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
            <Fact label="Frequency" value={`${meta?.every ?? 1} × ${plan.frequency}`} />
            {meta && <Fact label="Plan" value={meta.title} />}
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
          {canMutate && occ.status !== 'completed' ? (
            <fieldset disabled={pending} className={styles.fieldset}>
              <legend className="sr-only">Maintenance plan actions</legend>
              {!occ.workOrderRef && (
                <Button variant="primary" disabled={pending || meta?.enabled === false || meta?.needsReview} onClick={() => run(() => generatePpmWorkOrder(occ.id, setup?.companyId))}>Generate work order now</Button>
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
                  {setup && meta && asset ? <div className={styles.stack}><label className={layout.field}>Actual service date<input type="date" required max={data?.now} min={plan.lastServicedAt ?? '1900-01-01'} value={servicedOn} onChange={(e) => setServicedOn(e.target.value)} className={layout.control} /></label>{plan.basis !== 'calendar' && <label className={layout.field}>Service-time cumulative meter reading (h)<input type="number" required min={meta.baselineRuntimeHours} max={runtime?.runtimeHours ?? 0} step="0.01" value={runtimeAtService} onChange={(e) => setRuntimeAtService(e.target.value)} className={layout.control} /></label>}<label className={layout.field}>Service notes<textarea maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} className={layout.control} /></label><EvidencePicker expectedCompanyId={setup.companyId} resourceType="asset" resourceId={asset.id} selectedIds={evidenceIds} onChange={setEvidenceIds} disabled={pending} /><p className={styles.metadata}>Select actual stored evidence. Photo requirements are checked against the stored image type when you save. Finish a linked work order through Resolved before recording service.</p></div> : <>{plan.evidenceRequired && (
                    <Button onClick={() => setPhotos((p) => p + 1)} className={styles.evidence} style={{ justifyContent: 'flex-start' }}>
                      <Camera size={14} className="text-text-3" />
                      {photos > 0 ? `${photos} demo evidence item(s) recorded` : 'Record demo evidence count (required)'}
                    </Button>
                  )}
                  <p className={styles.metadata}>Evidence count is a demo input only. No photo file is uploaded or verified by this control.</p></> }
                  <Button variant="primary" disabled={pending || !canComplete} onClick={() => setReviewComplete(true)}>
                    {canComplete ? 'Review service completion' : `${plan.checklist.length - checked.size} item(s) left${plan.evidenceRequired && (setup ? evidenceIds.length === 0 : photos === 0) ? ' + evidence' : ''}`}
                  </Button>
                  {reviewComplete && <div className={styles.review}><p className={styles.text}>Confirm the service checklist is complete. This marks the occurrence serviced and advances the maintenance schedule.</p><div className={layout.actions}><Button disabled={pending} onClick={() => setReviewComplete(false)}>Go back</Button><Button variant="primary" disabled={pending || !canComplete} onClick={() => run(() => setup && meta && asset ? recordFacilityService({ expectedCompanyId: setup.companyId, expectedSiteId: asset.siteId, expectedUnitId: asset.unitId, assetId: asset.id, planId: plan.id, occurrenceId: occ.id, expectedPlanVersion: meta.version, checkedIds: [...checked], evidenceIds, servicedOn, runtimeAtService: plan.basis === 'calendar' ? null : Number(runtimeAtService), notes, idempotencyKey: submissionKey }) : completePpmOccurrence(occ.id, { checkedIds: [...checked], photoCount: photos }))}>{pending ? 'Saving…' : 'Confirm service completion'}</Button></div></div>}
                </Card>
              )}

              {/* Reschedule */}
              <div className={styles.reschedule}>
                <label className={layout.field}><span className={layout.title}>Reschedule service date</span><input disabled={pending} type="date" value={rDate} onChange={(e) => setRDate(e.target.value)} className={layout.control} /></label>
                <Button variant="secondary" disabled={pending || rDate === occ.dueDate || meta?.enabled === false || meta?.needsReview || !!occ.workOrderRef} onClick={() => run(() => reschedulePpmOccurrence(occ.id, rDate, setup?.companyId, meta?.version))} className="">Reschedule</Button>
              </div>
              {plan.statutory && <p className={styles.metadata}>Statutory — cannot move past {plan.statutoryDeadline}.</p>}
            </fieldset>
          ) : (
            <p className={styles.text}>{occ.status === 'completed' ? 'Completed service record — generate or reschedule a separate occurrence for further work.' : 'Read-only — only the Facility Manager can generate, complete or reschedule.'}</p>
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

'use client';

import { useState, useTransition } from 'react';
import { FacilityDialog } from '@/components/facility/facility-ui';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Camera, Check, Minus, X } from 'lucide-react';
import { Button, Card, CardHeader, StatusPill } from '@/components/ui';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './maintenance-clinexa.module.css';
import { humanizeStatus, type Tone } from '@/lib/status-tones';
import { SEVERITY_TONE, SEVERITY_PRIORITY } from '@/domain/inspections';
import { runInspection } from '@/server/actions/inspections';
import type { InspView, InspectionsData } from './types';

type R = 'pass' | 'fail' | 'na';
const INSP_TONE: Record<string, Tone> = { scheduled: 'info', in_progress: 'progress', passed: 'success', failed: 'danger', overdue: 'warn' };

export function RunInspectionDrawer({ inspection, canMutate, workOrderBasePath = '/work-orders', onClose }: { inspection: InspView; canMutate: boolean; workOrderBasePath?: InspectionsData['workOrderBasePath']; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isRunnable = canMutate && ['scheduled', 'overdue'].includes(inspection.status);

  const [results, setResults] = useState<Record<string, R>>(() =>
    Object.fromEntries(inspection.checklist.filter((c) => c.result).map((c) => [c.id, c.result as R])),
  );
  const [photos, setPhotos] = useState(0);
  const [review, setReview] = useState(false);

  const set = (id: string, r: R) => setResults((prev) => ({ ...prev, [id]: r }));
  const allMarked = inspection.checklist.every((c) => results[c.id]);
  const fails = inspection.checklist.filter((c) => results[c.id] === 'fail');
  const photoNeeded = inspection.checklist.some((c) => c.requiresPhoto && results[c.id] && results[c.id] !== 'na');
  const canComplete = allMarked && (!photoNeeded || photos > 0);

  const submit = () => { if (pending) return;
    setError(null);
    start(async () => { try {
      const r = await runInspection(inspection.id, { results: inspection.checklist.map((c) => ({ itemId: c.id, result: results[c.id] })), photoCount: photos });
      if (!r.ok) setError(r.error);
      else { onClose(); router.refresh(); }
     } catch { setError('The save could not be confirmed. Your entries are still here; refresh the record before retrying.'); } });
  };

  return (
    <FacilityDialog title={inspection.template} onClose={onClose} pending={pending} drawer width={640}>
      <div className={styles.stack}>
        <Card>
          <CardHeader title={inspection.ref} subtitle="Inspection record" action={<StatusPill status={humanizeStatus(inspection.status)} tone={INSP_TONE[inspection.status] ?? 'neutral'} />} />
          <dl className={styles.facts}><div><dt>Asset / scope</dt><dd>{inspection.assetName}</dd></div><div><dt>Inspector</dt><dd>{inspection.inspector}</dd></div><div><dt>Scheduled date</dt><dd>{inspection.scheduledDate}</dd></div></dl>
        </Card>

        <fieldset disabled={pending} className={styles.fieldset}>
          <legend className="sr-only">Inspection results</legend>
          {isRunnable && (
            <div className={styles.text}>
              Mark each item. Any <strong className="text-negative">fail</strong> auto-raises a work order — priority from severity.
            </div>
          )}

          {/* Checklist */}
          <div className={styles.stack}>
            {inspection.checklist.map((c) => {
              const r = results[c.id];
              return (
                <Card key={c.id} className={styles.checklistCard}>
                  <CardHeader title={c.label} subtitle={`${SEVERITY_PRIORITY[c.severity]} work order on fail${c.requiresPhoto ? ' · evidence required' : ''}`} action={<StatusPill status={c.severity} tone={SEVERITY_TONE[c.severity]} />} />
                  {isRunnable ? (
                    <div className={styles.segments} role="group" aria-label={`Result for ${c.label}`}>
                      <Seg active={r === 'pass'} tone="success" onClick={() => set(c.id, 'pass')} icon={<Check size={13} />} label="Pass" />
                      <Seg active={r === 'fail'} tone="danger" onClick={() => set(c.id, 'fail')} icon={<X size={13} />} label="Fail" />
                      <Seg active={r === 'na'} tone="muted" onClick={() => set(c.id, 'na')} icon={<Minus size={13} />} label="N/A" />
                    </div>
                  ) : (
                    <div>
                      {r ? <StatusPill status={r === 'na' ? 'N/A' : r} tone={r === 'pass' ? 'success' : r === 'fail' ? 'danger' : 'muted'} /> : <span className="text-[12px] text-text-3">not recorded</span>}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Evidence + submit / results */}
          {isRunnable ? (
            <Card className={styles.checklistCard}>
              <CardHeader title="Review & complete" subtitle="Check the recorded results and any follow-up work orders before confirming." />
              {photoNeeded && (
                <Button onClick={() => setPhotos((p) => p + 1)} className={styles.evidence}>
                  <Camera size={14} className="text-text-3" />
                  {photos > 0 ? `${photos} demo evidence item(s) recorded` : 'Record demo evidence count (required)'}
                </Button>
              )}
              {fails.length > 0 && (
                <p className={`${styles.text} ${styles.danger}`}>{fails.length} fail(s) → {fails.length} work order(s) will be raised on submit.</p>
              )}
              <p className={styles.metadata}>Evidence count is a demo input only. No photo file is uploaded or verified by this control.</p>
              <Button variant="primary" disabled={pending || !canComplete} onClick={() => setReview(true)}>
                {canComplete ? 'Review inspection result' : `${inspection.checklist.filter((c) => !results[c.id]).length} item(s) left${photoNeeded && photos === 0 ? ' + evidence' : ''}`}
              </Button>
              {review && <div className={styles.review}><p className={styles.text}>Confirm the recorded result. {fails.length ? `${fails.length} failed item(s) will raise ${fails.length} work order(s).` : 'The inspection will be marked passed.'} This completes the inspection record.</p><div className={layout.actions}><Button disabled={pending} onClick={() => setReview(false)}>Go back</Button><Button variant="primary" disabled={pending || !canComplete} onClick={submit}>{pending ? 'Saving…' : 'Confirm inspection result'}</Button></div></div>}
            </Card>
          ) : (
            inspection.raisedWorkOrderRefs.length > 0 && (
              <Card className={styles.checklistCard}>
                <CardHeader title="Auto-raised work orders" subtitle="Recorded follow-up work from failed inspection items" />
                <div className={styles.stack}>
                  {inspection.raisedWorkOrderRefs.map((ref) => (
                    <Link key={ref} href={`${workOrderBasePath}/${encodeURIComponent(ref)}`} className={styles.link}>{ref} →</Link>
                  ))}
                </div>
              </Card>
            )
          )}

        </fieldset>
        {error && <p role="alert" className="text-[14px] text-negative">{error}</p>}
      </div>
      </FacilityDialog>
  );
}

function Seg({ active, tone, onClick, icon, label }: { active: boolean; tone: Tone; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <Button aria-pressed={active} onClick={onClick}
      style={active ? { background: `color-mix(in srgb, var(--tone-${tone}) 8%, var(--surface))`, color: `var(--tone-${tone})`, borderColor: `var(--tone-${tone})` } : undefined}>
      {icon}{label}
    </Button>
  );
}

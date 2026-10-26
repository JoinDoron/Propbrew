'use client';

import { useRef, useState, useTransition } from 'react';
import { FacilityDialog } from '@/components/facility/facility-ui';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './maintenance-clinexa.module.css';
import { complianceState } from '@/domain/inspections';
import { scheduleInspection, rescheduleInspection } from '@/server/actions/inspections';
import type { ObView, InspView } from './types';

export function ScheduleDialog({ obligations, preselect, inspection, expectedCompanyId, now, onClose }: { obligations: ObView[]; preselect?: string; inspection?: InspView; expectedCompanyId?: string; now: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition(), [error, setError] = useState<string | null>(null);
  const [obligationId, setObligationId] = useState(preselect ?? obligations[0]?.id ?? '');
  const [date, setDate] = useState(inspection?.scheduledDate ?? now), [inspector, setInspector] = useState(inspection?.inspector ?? '');
  const inFlight = useRef(false), key = useRef<string | null>(null);
  const native = Boolean(expectedCompanyId), selected = obligations.find((row) => row.id === obligationId);
  const submit = () => { if (pending || inFlight.current) return;
    inFlight.current = true; if (!key.current) key.current = crypto.randomUUID(); setError(null);
    start(async () => { try {
      const result = inspection
        ? await rescheduleInspection(inspection.id, date, expectedCompanyId ? { expectedCompanyId, idempotencyKey: key.current!, expectedVersion: inspection.operation?.version ?? 1, expectedDate: inspection.scheduledDate } : undefined)
        : await scheduleInspection({ obligationId, date, inspector, ...(expectedCompanyId ? { expectedCompanyId, idempotencyKey: key.current!, expectedObligationVersion: selected?.configuration?.version ?? 1 } : {}) });
      if (!result.ok) setError(result.error); else { onClose(); router.refresh(); }
    } catch { setError('The save could not be confirmed. Your entries are still here; refresh the record before retrying.'); }
    finally { inFlight.current = false; } });
  };
  return <FacilityDialog title={inspection ? 'Reschedule inspection' : 'Schedule inspection'} onClose={onClose} pending={pending}>
    <div className={styles.form}>
      <label><span>Obligation</span><select disabled={pending || Boolean(inspection)} value={obligationId} onChange={(event) => { setObligationId(event.target.value); key.current = null; }} className={layout.select}>{obligations.map((obligation) => <option key={obligation.id} value={obligation.id}>{obligation.name} — {obligation.scopeLabel} ({complianceState(obligation.validUntil, Date.parse(`${now}T00:00:00Z`))})</option>)}</select></label>
      <div className={styles.facts}><label><span>Date</span><input disabled={pending} type="date" value={date} min="1900-01-01" max="2100-12-31" onChange={(event) => { setDate(event.target.value); key.current = null; }} className={layout.control} /></label><label><span>Inspector</span><input disabled={pending || Boolean(inspection)} value={inspector} onChange={(event) => { setInspector(event.target.value); key.current = null; }} placeholder="Name of assigned inspector or vendor" className={layout.control} /></label></div>
      <p className={styles.text}>{native ? 'The checklist is saved with this inspection. Record each result, its findings and actual evidence. A passing operational check does not renew a regulatory certificate.' : 'A checklist is created from the obligation’s template — you run it and record pass/fail per item, and failures raise work orders.'}</p>
      <div className={layout.actions}><Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button><Button variant="primary" onClick={submit} disabled={pending || !obligationId || native && inspector.trim().length < 2}>{inspection ? 'Save inspection date' : 'Schedule'}</Button></div>
      {error && <p role="alert" className="text-[14px] text-negative">{error}</p>}
    </div>
  </FacilityDialog>;
}

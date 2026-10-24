'use client';

import { useState, useTransition } from 'react';
import { FacilityDialog } from '@/components/facility/facility-ui';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from './maintenance-clinexa.module.css';
import { complianceState } from '@/domain/inspections';
import { scheduleInspection } from '@/server/actions/inspections';
import type { ObView } from './types';

export function ScheduleDialog({ obligations, preselect, now, onClose }: { obligations: ObView[]; preselect?: string; now: string; onClose: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [obligationId, setObligationId] = useState(preselect ?? obligations[0]?.id ?? '');
  const [date, setDate] = useState(now);
  const [inspector, setInspector] = useState('');

  const submit = () => { if (pending) return;
    setError(null);
    start(async () => { try {
      const r = await scheduleInspection({ obligationId, date, inspector });
      if (!r.ok) setError(r.error);
      else { onClose(); router.refresh(); }
     } catch { setError('The save could not be confirmed. Your entries are still here; refresh the record before retrying.'); } });
  };

  return (
    <FacilityDialog title="Schedule inspection" onClose={onClose} pending={pending}>


      <div className={styles.form}>
        <label>
          <span>Obligation</span>
          <select disabled={pending} value={obligationId} onChange={(e) => setObligationId(e.target.value)} className={layout.select}>
            {obligations.map((o) => (
              <option key={o.id} value={o.id}>{o.name} — {o.scopeLabel} ({complianceState(o.validUntil)})</option>
            ))}
          </select>
        </label>

        <div className={styles.facts}>
          <label>
            <span>Date</span>
            <input disabled={pending} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={layout.control} />
          </label>
          <label>
            <span>Inspector</span>
            <input disabled={pending} value={inspector} onChange={(e) => setInspector(e.target.value)} placeholder="e.g. Emeka / a vendor" className={layout.control} />
          </label>
        </div>

        <p className={styles.text}>A checklist is created from the obligation’s template — you run it and record pass/fail per item, and failures raise work orders.</p>

        <div className={layout.actions}>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={pending || !obligationId}>Schedule</Button>
        </div>
        {error && <p role="alert" className="text-[14px] text-negative">{error}</p>}
      </div>
      </FacilityDialog>
  );
}

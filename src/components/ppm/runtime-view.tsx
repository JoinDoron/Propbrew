'use client';

import { useState, useTransition } from 'react';
import { FacilityDialog } from '@/components/facility/facility-ui';
import layout from '@/components/ui/workspace-layout.module.css';
import { Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import styles from './maintenance-clinexa.module.css';
import { useRouter } from 'next/navigation';
import { Gauge, Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { addDays } from '@/domain/ppm';
import { logRuntimeReading, generatePpmWorkOrder } from '@/server/actions/ppm';
import type { PpmData } from './types';

export function RuntimeView({ data, onSelect }: { data: PpmData; onSelect: (id: string) => void }) {
  const cards = data.runtime
    .map((rt) => {
      const plan = data.plans.find((p) => String(p.assetId) === String(rt.assetId));
      const accrued = rt.runtimeHours - rt.runtimeHoursAtLastService;
      const remaining = Math.max(0, rt.runtimeServiceInterval - accrued);
      const daysToRuntime = rt.dailyRuntimeHours > 0 ? Math.ceil(remaining / rt.dailyRuntimeHours) : 9999;
      const runtimeDue = addDays(data.now, daysToRuntime);
      const calendarDue = plan?.nextDue ?? runtimeDue;
      const runtimeWins = Date.parse(runtimeDue) < Date.parse(calendarDue);
      const winner = runtimeWins ? runtimeDue : calendarDue;
      const occ = data.occurrences.filter((o) => o.planId === plan?.id && o.status !== 'completed').sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];
      return { rt, plan, accrued, remaining, daysToRuntime, runtimeDue, calendarDue, runtimeWins, winner, occId: occ?.id, pct: Math.min(100, Math.round((accrued / rt.runtimeServiceInterval) * 100)) };
    })
    .sort((a, b) => (a.winner < b.winner ? -1 : 1));

  if (cards.length === 0) return <Empty />;

  return (
    <div className={styles.runtimeGrid}>
      {cards.map((c) => (
        <Card key={String(c.rt.assetId)} className={styles.runtimeCard}>
          <CardHeader title={c.rt.assetName} subtitle={`${c.rt.dailyRuntimeHours}h/day · ${c.plan?.runtimeIntervalHours ?? c.rt.runtimeServiceInterval}h service interval`} action={c.runtimeWins ? <StatusPill status="Runtime-driven" tone="warn" /> : <Gauge size={20} className="text-primary" />} />

          {/* Big run-hours + gauge */}
          <div className={styles.runtimeGauge}>
            <div>
              <div className={styles.runtimeValue}>{c.accrued}<span className={styles.runtimeUnit}> / {c.rt.runtimeServiceInterval}h</span></div>
              <div className={styles.metadata}>Since last service</div>
            </div>
            <div className={styles.gauge}>
              <div className={styles.bar}>
                <div style={{ width: `${c.pct}%`, background: c.pct >= 85 ? 'var(--tone-danger)' : c.pct >= 60 ? 'var(--tone-warn)' : 'var(--tone-success)' }} />
              </div>
              <div className={styles.metadata}>{c.pct}% of interval</div>
            </div>
          </div>

          {/* Dual countdown */}
          <div className={styles.callout}>
            <p className={styles.text}>Service in <strong className={c.runtimeWins ? 'text-warning' : ''}>{c.remaining} running-hrs (~{c.daysToRuntime}d)</strong> or by <strong className={!c.runtimeWins ? 'text-warning' : ''}>{c.calendarDue}</strong> — whichever comes first.</p>
            <p className={styles.metadata}>Next service: <strong className="text-text-2">{c.winner}</strong></p>
          </div>

          {data.canMutate && (
            <div className={styles.toolbar}>
              <div className={styles.inline}>
              <LogReadingButton assetId={String(c.rt.assetId)} />
              {c.occId && (
                <GenerateButton occId={c.occId} generated={!!data.occurrences.find((o) => o.id === c.occId)?.workOrderRef} />
              )}
              </div>
              {c.occId && <Button variant="ghost" onClick={() => onSelect(c.occId!)} aria-label={`View runtime maintenance details for ${c.rt.assetName}`}>Details →</Button>}
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

function LogReadingButton({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState('');
  const [error, setError] = useState<string | null>(null);
  function submit() { if (pending || !(Number(hours) > 0)) return; setError(null); start(async () => { try { const result = await logRuntimeReading(assetId, Number(hours)); if (!result.ok) { setError(result.error); return; } setOpen(false); setHours(''); router.refresh(); } catch { setError('The runtime entry could not be confirmed. Refresh before retrying.'); } }); }
  return <><Button icon={<Plus size={16} />} onClick={() => setOpen(true)}>Log runtime</Button>{open && (
    <FacilityDialog title="Log additional runtime" onClose={() => setOpen(false)} pending={pending}>
      <div className={styles.stack}>
        <p className={layout.body}>Enter the additional running hours since the last recorded reading. This is a manual maintenance input, not a connected meter reading.</p>
        <label className={layout.field}><span>Additional running hours</span><input className={layout.control} type="number" min="0.01" step="0.01" inputMode="decimal" value={hours} disabled={pending} onChange={(event) => setHours(event.target.value)} required /></label>
        {error && <p role="alert" className="text-[14px] text-negative">{error}</p>}
        <div className={layout.actions}><Button disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={pending || !(Number(hours) > 0)} onClick={submit}>{pending ? 'Saving…' : 'Save runtime'}</Button></div>
      </div>
    </FacilityDialog>
  )}</>;
}

function GenerateButton({ occId, generated }: { occId: string; generated: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (generated) return <span className="text-[12px] text-positive font-medium">WO generated ✓</span>;
  function generate() { if (pending) return; setError(null); start(async () => { try { const result = await generatePpmWorkOrder(occId); if (!result.ok) { setError(result.error); return; } setOpen(false); router.refresh(); } catch { setError('Work-order creation could not be confirmed. Refresh before retrying.'); } }); }
  return <><Button variant="primary" onClick={() => setOpen(true)}>Generate WO</Button>{open && (
    <FacilityDialog title="Generate maintenance work order" onClose={() => setOpen(false)} pending={pending}>
      <div className={styles.stack}>
        <p className={layout.body}>Creates a work order for this maintenance occurrence. Review the plan and assignment before field work begins.</p>
        {error && <p role="alert" className="text-[14px] text-negative">{error}</p>}
        <div className={layout.actions}><Button disabled={pending} onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" disabled={pending} onClick={generate}>{pending ? 'Generating…' : 'Confirm work order'}</Button></div>
      </div>
    </FacilityDialog>
  )}</>;
}

function Empty() {
  return <Card><EmptyState title="No runtime-metered assets in scope" description="Generators and pumps appear here when runtime readings and service intervals are recorded." icon={<Gauge size={24} />} /></Card>;
}

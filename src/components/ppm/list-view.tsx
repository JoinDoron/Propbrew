'use client';

import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import styles from './maintenance-clinexa.module.css';
import { humanizeStatus } from '@/lib/status-tones';
import type { Tone } from '@/lib/status-tones';
import { MaintenancePlanToggle } from './maintenance-setup';
import type { PpmData } from './types';

const OCC_TONE: Record<string, Tone> = { scheduled: 'info', overdue: 'danger', wo_generated: 'progress', in_progress: 'progress', completed: 'success', ai_draft: 'muted' };
const BAND_TONE: Record<string, Tone> = { critical: 'danger', elevated: 'warn', healthy: 'success' };

export function PpmList({ data, onSelect, onEdit }: { data: PpmData; onSelect: (id: string) => void; onEdit?: (id: string) => void }) {
  // one row per plan: its earliest open occurrence + risk
  const rows = data.plans
    .map((plan) => {
      const occ = data.occurrences.filter((o) => o.planId === plan.id && o.status !== 'completed').sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];
      const risk = data.assessments.find((a) => String(a.assetId) === String(plan.assetId));
      return { plan, occ, risk };
    })
    .sort((a, b) => (a.occ?.dueDate ?? a.plan.nextDue).localeCompare(b.occ?.dueDate ?? b.plan.nextDue));

  return (
    <Card padded={false} className="overflow-hidden">
      <div className={styles.header}><CardHeader title="Maintenance plan register" subtitle={`${rows.length} plan${rows.length === 1 ? '' : 's'} · active, paused and runtime-only plans`} /></div>
      <div className={styles.scroll} role="region" aria-label="Maintenance plan register" tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr>
              {['Asset', 'Trade', 'Next due', 'Basis', 'Status', 'Assignee', 'Hrs', 'Risk', ...(data.setup && data.canMutate ? ['Actions'] : [])].map((h) => (
                <th scope="col" key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ plan, occ, risk }) => (
              <tr key={plan.id}>
                <td>
                  <Button variant="ghost" disabled={!occ} onClick={() => occ && onSelect(occ.id)} aria-label={`View maintenance plan for ${plan.assetName}`} className={styles.assetButton}>{plan.assetName}</Button>
                  <div className={styles.metadata}>{data.setup?.plans.find((p) => p.planId === plan.id)?.title} · {plan.frequency}{plan.statutory ? ' · statutory' : ''}</div>
                </td>
                <td>{plan.category}</td>
                <td>{data.setup?.plans.find((p) => p.planId === plan.id)?.enabled === false ? 'Paused' : occ?.dueDate ?? (plan.basis === 'runtime' ? 'Awaiting meter threshold' : plan.nextDue)}</td>
                <td>{(occ?.basisWon ?? plan.basis) === 'runtime' ? '⚡ runtime' : 'calendar'}</td>
                <td><StatusPill status={data.setup?.plans.find((p) => p.planId === plan.id)?.enabled === false ? 'Paused' : occ ? humanizeStatus(occ.status) : 'Awaiting service cycle'} tone={occ ? OCC_TONE[occ.status] ?? 'neutral' : 'muted'} /></td>
                <td>{plan.assignee}</td>
                <td>{plan.estimatedHours}</td>
                <td>
                  {risk ? <StatusPill status={String(risk.score)} tone={BAND_TONE[risk.band]} /> : <span className="text-text-3">—</span>}
                </td>
                {data.setup && data.canMutate && <td><div className={styles.stack}><Button disabled={data.setup.plans.find((p) => p.planId === plan.id)?.needsReview} onClick={() => onEdit?.(plan.id)}>Edit plan</Button><MaintenancePlanToggle data={data} plan={plan} /></div></td>}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={data.setup && data.canMutate ? 9 : 8}><EmptyState title="No open maintenance occurrences or plans" description="Create a maintenance plan to set its cadence, checklist and first service date." /></td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

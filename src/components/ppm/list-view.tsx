'use client';

import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import styles from './maintenance-clinexa.module.css';
import { humanizeStatus } from '@/lib/status-tones';
import type { Tone } from '@/lib/status-tones';
import type { PpmData } from './types';

const OCC_TONE: Record<string, Tone> = { scheduled: 'info', overdue: 'danger', wo_generated: 'progress', in_progress: 'progress', completed: 'success', ai_draft: 'muted' };
const BAND_TONE: Record<string, Tone> = { critical: 'danger', elevated: 'warn', healthy: 'success' };

export function PpmList({ data, onSelect }: { data: PpmData; onSelect: (id: string) => void }) {
  // one row per plan: its earliest open occurrence + risk
  const rows = data.plans
    .map((plan) => {
      const occ = data.occurrences.filter((o) => o.planId === plan.id && o.status !== 'completed').sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))[0];
      const risk = data.assessments.find((a) => String(a.assetId) === String(plan.assetId));
      return { plan, occ, risk };
    })
    .filter((r) => r.occ)
    .sort((a, b) => (a.occ!.dueDate < b.occ!.dueDate ? -1 : 1));

  return (
    <Card padded={false} className="overflow-hidden">
      <div className={styles.header}><CardHeader title="Maintenance plan register" subtitle={`${rows.length} plan${rows.length === 1 ? '' : 's'} with an open occurrence · earliest due dates first`} /></div>
      <div className={styles.scroll} role="region" aria-label="Maintenance plan register" tabIndex={0}>
        <table className={styles.table}>
          <thead>
            <tr>
              {['Asset', 'Trade', 'Next due', 'Basis', 'Status', 'Assignee', 'Hrs', 'Risk'].map((h) => (
                <th scope="col" key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ plan, occ, risk }) => (
              <tr key={plan.id}>
                <td>
                  <Button variant="ghost" onClick={() => onSelect(occ!.id)} aria-label={`View maintenance plan for ${plan.assetName}`} className={styles.assetButton}>{plan.assetName}</Button>
                  <div className={styles.metadata}>{plan.frequency}{plan.statutory ? ' · statutory' : ''}</div>
                </td>
                <td>{plan.category}</td>
                <td>{occ!.dueDate}</td>
                <td>{occ!.basisWon === 'runtime' ? '⚡ runtime' : 'calendar'}</td>
                <td><StatusPill status={humanizeStatus(occ!.status)} tone={OCC_TONE[occ!.status] ?? 'neutral'} /></td>
                <td>{plan.assignee}</td>
                <td>{plan.estimatedHours}</td>
                <td>
                  {risk ? <StatusPill status={String(risk.score)} tone={BAND_TONE[risk.band]} /> : <span className="text-text-3">—</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8}><EmptyState title="No open maintenance occurrences" description="Plans appear here when there is a scheduled service to review." /></td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

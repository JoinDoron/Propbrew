'use client';

import { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import styles from './maintenance-clinexa.module.css';
import { humanizeStatus, type Tone } from '@/lib/status-tones';
import type { InspectionsData } from './types';

const INSP_TONE: Record<string, Tone> = { scheduled: 'info', in_progress: 'progress', passed: 'success', failed: 'danger', overdue: 'warn' };
const STATUSES = ['all', 'overdue', 'scheduled', 'failed', 'passed'];

export function InspectionsList({ data, onRun }: { data: InspectionsData; onRun: (id: string) => void }) {
  const [filter, setFilter] = useState('all');
  const counts = data.inspections.reduce<Record<string, number>>((a, i) => ((a[i.status] = (a[i.status] ?? 0) + 1), a), {});
  const rows = useMemo(() => (filter === 'all' ? data.inspections : data.inspections.filter((i) => i.status === filter)), [data.inspections, filter]);

  return (
    <Card padded={false} className="overflow-hidden">
      <div className={styles.header}><CardHeader title="Inspection register" subtitle={`${data.inspections.length} recorded inspection${data.inspections.length === 1 ? '' : 's'} · filter by status to review the next action`} /></div>
      <div className={styles.filters} role="group" aria-label="Filter inspections by status">
        {STATUSES.filter((s) => s === 'all' || counts[s]).map((s) => (
          <Button key={s} aria-pressed={filter === s} onClick={() => setFilter(s)}>
            {s === 'all' ? 'All' : humanizeStatus(s)}<span className={styles.filterCount}>{s === 'all' ? data.inspections.length : counts[s] ?? 0}</span>
          </Button>
        ))}
      </div>

        <div className={styles.scroll} role="region" aria-label="Inspection register" tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                {['Ref', 'Inspection · Asset', 'Status', 'Scheduled', 'Pass / Fail', 'WOs', 'Actions'].map((h, i) => (
                  <th scope="col" key={h} className={i >= 3 ? styles.numeric : undefined}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id}>
                  <td>{i.ref}</td>
                  <td>
                    <div className={styles.text}>{i.template}</div>
                    <div className={styles.metadata}>{i.assetName}{i.criticality === 'statutory' ? ' · statutory' : ''}</div>
                  </td>
                  <td><StatusPill status={humanizeStatus(i.status)} tone={INSP_TONE[i.status] ?? 'neutral'} /></td>
                  <td className={styles.numeric}>{i.scheduledDate}</td>
                  <td className={styles.numeric}>
                    <span className="text-positive font-mono">{i.passItems}</span><span className="text-text-3"> / </span><span className={i.failItems ? 'text-negative font-mono' : 'text-text-3 font-mono'}>{i.failItems}</span>
                  </td>
                  <td className={styles.numeric}>{i.raisedWorkOrders || '—'}</td>
                  <td className={styles.numeric}>
                    {data.canMutate && ['scheduled', 'overdue'].includes(i.status)
                      ? <Button variant="primary" icon={<Play size={14} />} aria-label={`Run inspection ${i.ref}`} onClick={(e) => { e.stopPropagation(); onRun(i.id); }}>Run</Button>
                      : <Button variant="ghost" aria-label={`View inspection ${i.ref}`} onClick={(e) => { e.stopPropagation(); onRun(i.id); }}>View →</Button>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={7}><EmptyState title="No inspections match this view" description="Scheduled inspections and recorded results will appear here." /></td></tr>}
            </tbody>
          </table>
        </div>
    </Card>
  );
}

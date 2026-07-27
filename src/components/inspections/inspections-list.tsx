'use client';

import { useMemo, useState } from 'react';
import { Play } from 'lucide-react';
import { Button, StatusPill } from '@/components/ui';
import { humanizeStatus, type Tone } from '@/lib/status-tones';
import type { InspectionsData } from './types';

const INSP_TONE: Record<string, Tone> = { scheduled: 'info', in_progress: 'progress', passed: 'success', failed: 'danger', overdue: 'warn' };
const STATUSES = ['all', 'overdue', 'scheduled', 'failed', 'passed'];

export function InspectionsList({ data, onRun }: { data: InspectionsData; onRun: (id: string) => void }) {
  const [filter, setFilter] = useState('all');
  const counts = data.inspections.reduce<Record<string, number>>((a, i) => ((a[i.status] = (a[i.status] ?? 0) + 1), a), {});
  const rows = useMemo(() => (filter === 'all' ? data.inspections : data.inspections.filter((i) => i.status === filter)), [data.inspections, filter]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 flex-wrap">
        {STATUSES.filter((s) => s === 'all' || counts[s]).map((s) => (
          <button key={s} onClick={() => setFilter(s)} className={`h-8 px-3 rounded-full text-[12px] font-medium border transition-colors inline-flex items-center gap-1.5 ${filter === s ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2 hover:bg-surface-2'}`}>
            {s === 'all' ? 'All' : humanizeStatus(s)}<span className="text-text-3 font-mono">{s === 'all' ? data.inspections.length : counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="w-full overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                {['Ref', 'Inspection · Asset', 'Status', 'Scheduled', 'Pass / Fail', 'WOs', ''].map((h, i) => (
                  <th key={h} className={`text-left text-[10.5px] font-semibold tracking-[0.06em] uppercase text-text-3 px-4 py-2.5 border-b border-border whitespace-nowrap ${i >= 4 ? 'text-right' : ''}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((i) => (
                <tr key={i.id} onClick={() => onRun(i.id)} className="hover:bg-surface-2 transition-colors cursor-pointer">
                  <td className="px-4 py-2.5 border-b border-border font-mono font-semibold text-[13px]">{i.ref}</td>
                  <td className="px-4 py-2.5 border-b border-border">
                    <div className="text-[13px] font-medium">{i.template}</div>
                    <div className="text-[11.5px] text-text-3">{i.assetName}{i.criticality === 'statutory' ? ' · statutory' : ''}</div>
                  </td>
                  <td className="px-4 py-2.5 border-b border-border"><StatusPill status={humanizeStatus(i.status)} tone={INSP_TONE[i.status] ?? 'neutral'} /></td>
                  <td className="px-4 py-2.5 border-b border-border text-right font-mono text-[12.5px]">{i.scheduledDate}</td>
                  <td className="px-4 py-2.5 border-b border-border text-right text-[13px]">
                    <span className="text-positive font-mono">{i.passItems}</span><span className="text-text-3"> / </span><span className={i.failItems ? 'text-negative font-mono' : 'text-text-3 font-mono'}>{i.failItems}</span>
                  </td>
                  <td className="px-4 py-2.5 border-b border-border text-right font-mono text-[12.5px] text-text-3">{i.raisedWorkOrders || '—'}</td>
                  <td className="px-4 py-2.5 border-b border-border text-right">
                    {data.canMutate && ['scheduled', 'overdue'].includes(i.status)
                      ? <Button variant="primary" className="!h-7 !px-2.5 !text-[11.5px]" icon={<Play size={12} />} onClick={(e) => { e.stopPropagation(); onRun(i.id); }}>Run</Button>
                      : <span className="text-[12px] text-primary">View →</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

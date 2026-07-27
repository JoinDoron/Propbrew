'use client';

import { StatusPill } from '@/components/ui';
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
    <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
      <div className="w-full overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {['Asset', 'Trade', 'Next due', 'Basis', 'Status', 'Assignee', 'Hrs', 'Risk'].map((h) => (
                <th key={h} className="text-left text-[10.5px] font-semibold tracking-[0.06em] uppercase text-text-3 px-4 py-2.5 border-b border-border whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ plan, occ, risk }) => (
              <tr key={plan.id} onClick={() => onSelect(occ!.id)} className="hover:bg-surface-2 transition-colors cursor-pointer">
                <td className="px-4 py-2.5 border-b border-border">
                  <div className="text-[13px] font-medium">{plan.assetName}</div>
                  <div className="text-[11px] text-text-3">{plan.frequency}{plan.statutory ? ' · statutory' : ''}</div>
                </td>
                <td className="px-4 py-2.5 border-b border-border text-[12.5px] text-text-2">{plan.category}</td>
                <td className="px-4 py-2.5 border-b border-border font-mono text-[12.5px]">{occ!.dueDate}</td>
                <td className="px-4 py-2.5 border-b border-border text-[12px] text-text-2">{occ!.basisWon === 'runtime' ? '⚡ runtime' : 'calendar'}</td>
                <td className="px-4 py-2.5 border-b border-border"><StatusPill status={humanizeStatus(occ!.status)} tone={OCC_TONE[occ!.status] ?? 'neutral'} /></td>
                <td className="px-4 py-2.5 border-b border-border text-[12.5px] text-text-2">{plan.assignee}</td>
                <td className="px-4 py-2.5 border-b border-border font-mono text-[12.5px] text-text-3">{plan.estimatedHours}</td>
                <td className="px-4 py-2.5 border-b border-border">
                  {risk ? <StatusPill status={String(risk.score)} tone={BAND_TONE[risk.band]} /> : <span className="text-text-3">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

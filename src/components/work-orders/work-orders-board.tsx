'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { LayoutGrid, List, Plus } from 'lucide-react';
import { Button } from '@/components/ui';
import { DomainStatus, Money, ReadOnlyChip, SlaBadge } from '@/components/domain';
import { humanizeStatus, statusTone, toneVar } from '@/lib/status-tones';
import type { Money as MoneyValue } from '@/domain/primitives';
import type { WorkOrderStatus } from '@/domain/enums';

export type WoRow = {
  id: string;
  ref: string;
  title: string;
  origin: string;
  requesterName: string;
  status: WorkOrderStatus;
  priority: string;
  assigneeName: string;
  respondDueAt: string | null;
  breached: boolean;
  cost: MoneyValue | null;
};

// §10 lifecycle order — drives both the tab order and the board columns so the
// pipeline always reads left-to-right as progress.
const STATUS_ORDER: WorkOrderStatus[] = ['new', 'triaged', 'assigned', 'in_progress', 'on_hold', 'resolved', 'verified', 'closed', 'rejected', 'cancelled'];

export function WorkOrdersBoard({ rows, canMutate }: { rows: WoRow[]; canMutate: boolean }) {
  const [status, setStatus] = useState<WorkOrderStatus | 'all'>('all');
  const [view, setView] = useState<'list' | 'board'>('list');

  const counts = useMemo(() => rows.reduce<Record<string, number>>((a, w) => ((a[w.status] = (a[w.status] ?? 0) + 1), a), {}), [rows]);
  const presentStatuses = STATUS_ORDER.filter((s) => counts[s]);
  const filtered = status === 'all' ? rows : rows.filter((w) => w.status === status);

  return (
    <div className="flex flex-col gap-3.5">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        {view === 'list' ? (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Tab label="All" count={rows.length} active={status === 'all'} onClick={() => setStatus('all')} />
            {presentStatuses.map((s) => (
              <Tab key={s} label={humanizeStatus(s)} count={counts[s]} tone={s} active={status === s} onClick={() => setStatus(s)} />
            ))}
          </div>
        ) : (
          <div className="text-[13px] text-text-2 font-medium">Pipeline · {rows.length} work orders</div>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border-2 bg-surface p-0.5">
            <ToggleBtn active={view === 'list'} onClick={() => setView('list')} icon={<List size={15} />} label="List" />
            <ToggleBtn active={view === 'board'} onClick={() => setView('board')} icon={<LayoutGrid size={15} />} label="Board" />
          </div>
          {canMutate ? <Button variant="primary" icon={<Plus size={15} />} className="!h-8 !text-[12px]">New</Button> : <ReadOnlyChip />}
        </div>
      </div>

      {view === 'list' ? (
        <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {['Ref', 'Job', 'Status', 'Priority', 'Assignee', 'SLA', 'Cost'].map((h, i) => (
                    <th key={h} className={`text-left text-[10.5px] font-semibold tracking-[0.06em] uppercase text-text-3 px-4 py-2.5 border-b border-border whitespace-nowrap ${i > 4 ? 'text-right' : ''} ${i === 3 || i === 4 ? 'max-[720px]:hidden' : ''} ${i === 5 ? 'max-[560px]:hidden' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((w) => (
                  <tr key={w.id} className="hover:bg-surface-2 transition-colors">
                    <td className="px-4 py-2.5 border-b border-border"><Link href={`/work-orders/${w.ref}`} className="font-mono font-semibold text-[13px] text-primary hover:underline">{w.ref}</Link></td>
                    <td className="px-4 py-2.5 border-b border-border">
                      <Link href={`/work-orders/${w.ref}`} className="block">
                        <div className="text-[13px] font-medium hover:text-primary transition-colors">{w.title}</div>
                        <div className="text-[11.5px] text-text-3">{w.origin.replace(/_/g, ' ')} · {w.requesterName}</div>
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 border-b border-border"><DomainStatus type="work_order" status={w.status} /></td>
                    <td className="px-4 py-2.5 border-b border-border text-[13px] capitalize max-[720px]:hidden">{w.priority}</td>
                    <td className="px-4 py-2.5 border-b border-border text-[13px] text-text-2 max-[720px]:hidden">{w.assigneeName}</td>
                    <td className="px-4 py-2.5 border-b border-border max-[560px]:hidden"><SlaBadge dueAt={w.respondDueAt} breached={w.breached} /></td>
                    <td className="px-4 py-2.5 border-b border-border text-right"><Money value={w.cost} /></td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-[13px] text-text-3">No work orders in “{humanizeStatus(status)}”.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {presentStatuses.map((s) => (
            <div key={s} className="flex-none w-[260px] bg-surface-2 rounded-2xl border border-border p-2.5">
              <div className="flex items-center gap-2 px-1.5 pb-2">
                <span className="w-2 h-2 rounded-full" style={{ background: toneVar(statusTone('work-order', s)) }} />
                <span className="text-[12.5px] font-semibold">{humanizeStatus(s)}</span>
                <span className="text-[11px] text-text-3 font-mono ml-auto">{counts[s]}</span>
              </div>
              <div className="flex flex-col gap-2">
                {rows.filter((w) => w.status === s).map((w) => (
                  <Link key={w.id} href={`/work-orders/${w.ref}`} className="block bg-surface border border-border rounded-xl p-3 hover:border-primary transition-colors">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[11.5px] font-semibold text-primary">{w.ref}</span>
                      <span className="text-[10.5px] text-text-3 capitalize">{w.priority}</span>
                    </div>
                    <div className="text-[12.5px] font-medium mt-1 leading-snug">{w.title}</div>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className="text-[11px] text-text-3 truncate">{w.assigneeName}</span>
                      {w.breached ? <SlaBadge dueAt={w.respondDueAt} breached /> : <Money value={w.cost} className="!text-[11.5px]" />}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tab({ label, count, tone, active, onClick }: { label: string; count: number; tone?: WorkOrderStatus; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`h-8 px-3 rounded-full text-[12.5px] font-medium border transition-colors inline-flex items-center gap-1.5 ${active ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2 hover:bg-surface-2'}`}>
      {tone && <span className="w-1.5 h-1.5 rounded-full" style={{ background: toneVar(statusTone('work-order', tone)) }} />}
      {label}<span className={`font-mono ${active ? 'text-primary' : 'text-text-3'}`}>{count}</span>
    </button>
  );
}

function ToggleBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors ${active ? 'bg-primary text-white' : 'text-text-2 hover:bg-surface-2'}`}>
      {icon}{label}
    </button>
  );
}

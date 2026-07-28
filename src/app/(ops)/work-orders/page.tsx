import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { CardHeader } from '@/components/ui';
import { ScopeBanner } from '@/components/domain';
import { WorkOrdersBoard } from '@/components/work-orders/work-orders-board';
import { WorkOrdersIntel } from '@/components/work-orders/work-orders-intel';
import { NOW_MS } from '@/domain/ppm';

const NOW = '2026-07-26T09:00:00Z';
const CLOSED = ['closed', 'cancelled', 'rejected', 'verified'];

/** FM-03 — work-order register. The status tabs filter the list, and a List/Board
 *  toggle shows the §10 pipeline as a kanban. Managers (M) get a New button;
 *  view-only roles (Executive, V) get a Read-only chip. */
export default async function WorkOrdersPage() {
  const { actor } = await requireCapability('work_orders');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'work_orders'));
  const rows = repos.workOrders.list(actor).items;
  const wos = [...rows];
  const open = rows.filter((w) => !CLOSED.includes(w.status)).length;

  const boardRows = rows.map((w) => ({
    id: w.id,
    ref: w.ref,
    title: w.title,
    origin: w.origin,
    requesterName: w.requesterName,
    status: w.status,
    priority: w.priority,
    assigneeName: w.assigneeName,
    respondDueAt: w.respondDueAt,
    breached: !CLOSED.includes(w.status) && (w.respondDueAt ?? '') < NOW,
    cost: w.cost,
  }));

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <CardHeader title={`${open} open · ${rows.length} total`} subtitle="Live SLA countdowns, AI triage and workload — every job from request to close" />
      <WorkOrdersIntel wos={wos} nowMs={NOW_MS} canMutate={canMutate} />
      <WorkOrdersBoard rows={boardRows} canMutate={canMutate} />
    </div>
  );
}

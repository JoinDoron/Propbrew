import Link from 'next/link';
import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { Button, Card, CardHeader, Table, Td, Th, TableRow } from '@/components/ui';
import { DomainStatus, Money, ReadOnlyChip, ScopeBanner, SlaBadge } from '@/components/domain';
import { humanizeStatus } from '@/lib/status-tones';
import { Plus } from 'lucide-react';

const NOW = '2026-07-26T09:00:00Z';
const CLOSED = ['closed', 'cancelled', 'rejected', 'verified'];

/** FM-03 — work-order register. Managers (M) get a New button; view-only roles
 *  (Executive, V) get a Read-only chip — the control is removed, not disabled,
 *  so the capability is not even discoverable. */
export default async function WorkOrdersPage() {
  const { actor } = await requireCapability('work_orders');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'work_orders'));
  const rows = repos.workOrders.list(actor).items;

  const byStatus = rows.reduce<Record<string, number>>((a, w) => ((a[w.status] = (a[w.status] ?? 0) + 1), a), {});
  const open = rows.filter((w) => !CLOSED.includes(w.status)).length;

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />

      <div className="flex flex-wrap gap-2 items-center">
        {Object.entries(byStatus).map(([s, n]) => (
          <span key={s} className="inline-flex items-center gap-1.5 h-[30px] px-3 rounded-full border border-border-2 bg-surface text-[12.5px]">
            {humanizeStatus(s)}<span className="text-text-3 font-mono">{n}</span>
          </span>
        ))}
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader
            title={`${open} open · ${rows.length} total`}
            subtitle="Every maintenance job from request to close"
            action={canMutate ? <Button variant="primary" icon={<Plus size={16} />}>New work order</Button> : <ReadOnlyChip />}
          />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Ref</Th>
              <Th>Job</Th>
              <Th>Status</Th>
              <Th className="max-[720px]:hidden">Priority</Th>
              <Th className="max-[720px]:hidden">Assignee</Th>
              <Th className="max-[560px]:hidden">SLA</Th>
              <Th className="text-right">Cost</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => {
              const breached = !CLOSED.includes(w.status) && (w.respondDueAt ?? '') < NOW;
              return (
                <TableRow key={w.id}>
                  <Td>
                    <Link href={`/work-orders/${w.ref}`} className="font-mono font-semibold text-[13px] text-primary hover:underline">
                      {w.ref}
                    </Link>
                  </Td>
                  <Td>
                    <Link href={`/work-orders/${w.ref}`} className="block">
                      <div className="text-[13px] font-medium hover:text-primary transition-colors">{w.title}</div>
                      <div className="text-[11.5px] text-text-3">{w.origin.replace(/_/g, ' ')} · {w.requesterName}</div>
                    </Link>
                  </Td>
                  <Td><DomainStatus type="work_order" status={w.status} /></Td>
                  <Td className="max-[720px]:hidden text-[13px] capitalize">{w.priority}</Td>
                  <Td className="max-[720px]:hidden text-[13px] text-text-2">{w.assigneeName}</Td>
                  <Td className="max-[560px]:hidden"><SlaBadge dueAt={w.respondDueAt} breached={breached} /></Td>
                  <Td className="text-right"><Money value={w.cost} /></Td>
                </TableRow>
              );
            })}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

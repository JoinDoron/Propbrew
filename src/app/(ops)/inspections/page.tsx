import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { Button, Card, CardHeader, KpiCard, StatusPill, Mono, Table, Td, Th, TableRow } from '@/components/ui';
import { ReadOnlyChip, ScopeBanner } from '@/components/domain';
import type { Tone } from '@/lib/status-tones';
import { ClipboardCheck, Plus, TriangleAlert } from 'lucide-react';

const INSPECTION_TONE: Record<string, Tone> = { scheduled: 'info', passed: 'success', failed: 'danger', overdue: 'warn' };

/** FM-06 — inspections & compliance (Should). Failed items auto-raise work
 *  orders (FM-03); the compliance register surfaces overdue obligations. */
export default async function InspectionsPage() {
  const { actor } = await requireCapability('inspections_compliance');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'inspections_compliance'));
  const rows = repos.inspections.list(actor).items;

  const overdue = rows.filter((i) => i.status === 'overdue').length;
  const failed = rows.filter((i) => i.status === 'failed').length;
  const raised = rows.reduce((a, i) => a + i.raisedWorkOrders, 0);

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />

      <div className="grid grid-cols-1 min-[560px]:grid-cols-3 gap-3.5">
        <KpiCard label="Overdue" value={String(overdue)} delta={overdue ? 'compliance risk' : 'up to date'} positive={overdue === 0} icon={<TriangleAlert size={18} />} iconBg="rgba(245,159,11,.15)" iconColor="#f59e0b" />
        <KpiCard label="Failed inspections" value={String(failed)} icon={<ClipboardCheck size={18} />} iconBg="rgba(239,68,68,.12)" iconColor="#ef4444" />
        <KpiCard label="Work orders raised" value={String(raised)} delta="from failed items" positive icon={<ClipboardCheck size={18} />} />
      </div>

      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader
            title="Inspections"
            subtitle="Compliance, evidenced not assumed"
            action={canMutate ? <Button variant="primary" icon={<Plus size={16} />}>Schedule inspection</Button> : <ReadOnlyChip />}
          />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Ref</Th>
              <Th>Template · Asset</Th>
              <Th>Status</Th>
              <Th className="max-[560px]:hidden">Scheduled</Th>
              <Th className="text-right">Pass / Fail</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <TableRow key={i.id}>
                <Td><Mono className="font-semibold text-[13px]">{i.ref}</Mono></Td>
                <Td>
                  <div className="text-[13px] font-medium">{i.template}</div>
                  <div className="text-[11.5px] text-text-3">{i.assetName}</div>
                </Td>
                <Td><StatusPill status={i.status} tone={INSPECTION_TONE[i.status] ?? 'neutral'} /></Td>
                <Td className="max-[560px]:hidden font-mono text-[12.5px]">{i.scheduledDate}</Td>
                <Td className="text-right text-[13px]">
                  <span className="text-positive font-mono">{i.passItems}</span>
                  <span className="text-text-3"> / </span>
                  <span className={i.failItems > 0 ? 'text-negative font-mono' : 'text-text-3 font-mono'}>{i.failItems}</span>
                </Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

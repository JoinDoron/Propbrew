import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { Button, Card, CardHeader, Mono, Table, Td, Th, TableRow } from '@/components/ui';
import { DomainStatus } from '@/components/domain';
import { Plus } from 'lucide-react';

/** EM-03 (resident view) — My Requests. A resident may raise and rate (create),
 *  but not drive the §10 work-order machine — that is manager/technician work. */
export default async function MyRequestsPage() {
  const { actor } = await requireCapability('work_orders');
  const rows = repos.workOrders.list(actor).items;

  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-3.5">
      <div className="flex items-center justify-end">
        <Button variant="primary" icon={<Plus size={16} />}>Raise a request</Button>
      </div>
      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title="My requests" subtitle="Maintenance you have raised, tracked to resolution" />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Ref</Th>
              <Th>Job</Th>
              <Th>Status</Th>
              <Th className="max-[560px]:hidden">Assignee</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <TableRow key={w.id}>
                <Td><Mono className="font-semibold text-[13px]">{w.ref}</Mono></Td>
                <Td className="text-[13px]">{w.title}</Td>
                <Td><DomainStatus type="work_order" status={w.status} /></Td>
                <Td className="max-[560px]:hidden text-[13px] text-text-2">{w.assigneeName}</Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

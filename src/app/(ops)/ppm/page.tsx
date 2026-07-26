import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { Button, Card, CardHeader, StatusPill, Table, Td, Th, TableRow } from '@/components/ui';
import { ReadOnlyChip, ScopeBanner } from '@/components/domain';
import { Plus } from 'lucide-react';

/** FM-02 — preventive maintenance plans. Overdue plans are flagged (§10: "overdue
 *  flagged"); the scheduler auto-generates work orders ahead of the due date. */
export default async function PpmPage() {
  const { actor } = await requireCapability('assets_ppm');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'assets_ppm'));
  const rows = repos.ppmPlans.list(actor).items;
  const overdue = rows.filter((p) => p.overdue).length;

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader
            title={`${rows.length} plans · ${overdue} overdue`}
            subtitle="Preventive maintenance, scheduled before failure"
            action={canMutate ? <Button variant="primary" icon={<Plus size={16} />}>New plan</Button> : <ReadOnlyChip />}
          />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Asset</Th>
              <Th>Frequency</Th>
              <Th>Next due</Th>
              <Th>Status</Th>
              <Th className="max-[560px]:hidden">Assignee</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <Td className="text-[13px] font-medium">{p.assetName}</Td>
                <Td className="text-[13px] capitalize">{p.frequency}</Td>
                <Td className="font-mono text-[12.5px]">{p.nextDue}</Td>
                <Td>
                  {p.overdue ? <StatusPill status="Overdue" tone="danger" /> : <StatusPill status="On schedule" tone="success" />}
                </Td>
                <Td className="max-[560px]:hidden text-[13px] text-text-2">{p.assignee}</Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { Button, Card, CardHeader, StatusPill, Table, Td, Th, TableRow } from '@/components/ui';
import { ReadOnlyChip, ScopeBanner } from '@/components/domain';
import type { Tone } from '@/lib/status-tones';
import { Plus } from 'lucide-react';

const COMPLIANCE_TONE: Record<string, Tone> = { valid: 'success', expiring: 'warn', expired: 'danger' };

/** FM-05 — vendor management. Document-expiry compliance drives an alert tone;
 *  performance metrics (jobs, SLA hit rate, rating) come straight off the org. */
export default async function VendorsPage() {
  const { actor } = await requireCapability('work_orders');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'work_orders'));
  const rows = repos.vendors.list(actor).items;

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader
            title={`${rows.length} vendors`}
            subtitle="Your approved contractor network"
            action={canMutate ? <Button variant="primary" icon={<Plus size={16} />}>Onboard vendor</Button> : <ReadOnlyChip />}
          />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Vendor</Th>
              <Th className="max-[720px]:hidden">Services</Th>
              <Th>Compliance</Th>
              <Th className="text-right max-[560px]:hidden">SLA hit</Th>
              <Th className="text-right">Rating</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => (
              <TableRow key={v.id}>
                <Td>
                  <div className="text-[13px] font-medium">{v.name}</div>
                  <div className="text-[11.5px] text-text-3">{v.jobsCompleted} jobs · {v.coverage}</div>
                </Td>
                <Td className="max-[720px]:hidden text-[12.5px] text-text-2">{v.services.join(', ')}</Td>
                <Td>
                  <StatusPill status={v.compliance} tone={COMPLIANCE_TONE[v.compliance] ?? 'neutral'} />
                  <div className="text-[11px] text-text-3 mt-1">exp {v.insuranceExpiry}</div>
                </Td>
                <Td className="text-right max-[560px]:hidden"><span className="font-mono text-[13px]">{v.slaHitRate}%</span></Td>
                <Td className="text-right"><span className="font-mono text-[13px]">★ {v.rating}</span></Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

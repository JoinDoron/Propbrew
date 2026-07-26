import Link from 'next/link';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { Card, CardHeader, Mono, Table, Td, Th, TableRow } from '@/components/ui';
import { DomainStatus, Money } from '@/components/domain';

/** FM-05 / FM-03 (vendor view) — My Jobs. Work orders assigned to the vendor's
 *  own org only (§7 O via my_vendor_org). Detail lives under the ops route,
 *  which the portal shell will not open, so this is a read list for now. */
export default async function VendorJobsPage() {
  const { actor } = await requireCapability('work_orders');
  const rows = repos.workOrders.list(actor).items;

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-3.5">
      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title={`${rows.length} jobs`} subtitle="Work assigned to your organisation" />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Ref</Th>
              <Th>Job</Th>
              <Th>Status</Th>
              <Th className="text-right">Value</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <TableRow key={w.id}>
                <Td><Mono className="font-semibold text-[13px]">{w.ref}</Mono></Td>
                <Td className="text-[13px]">{w.title}</Td>
                <Td><DomainStatus type="work_order" status={w.status} /></Td>
                <Td className="text-right"><Money value={w.cost} /></Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
        {rows.length === 0 && <p className="p-6 text-center text-[13px] text-text-3">No jobs assigned to you yet.</p>}
      </Card>
      <p className="text-[11.5px] text-text-3 text-center">
        <Link href="/portal" className="hover:text-text-2">Vendor portal</Link> · jobs are scoped to your organisation only
      </p>
    </div>
  );
}

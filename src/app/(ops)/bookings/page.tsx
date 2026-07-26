import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { Button, Card, CardHeader, Mono, Table, Td, Th, TableRow } from '@/components/ui';
import { DomainStatus, Money, ReadOnlyChip, ScopeBanner } from '@/components/domain';
import { Plus } from 'lucide-react';

/** EM-05 — amenity bookings (Should). Managers approve/decline; the state track is
 *  Requested → Approved/Auto-approved → Confirmed → Completed. */
export default async function BookingsPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'bookings_amenities'));
  const rows = repos.bookings.list(actor).items;
  const pending = rows.filter((b) => b.status === 'requested').length;

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader
            title={`${rows.length} bookings · ${pending} awaiting approval`}
            subtitle="Amenity reservations and availability"
            action={canMutate ? <Button variant="primary" icon={<Plus size={16} />}>Add amenity</Button> : <ReadOnlyChip />}
          />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Amenity</Th>
              <Th>Resident</Th>
              <Th>Status</Th>
              <Th className="max-[560px]:hidden">Slot</Th>
              <Th className="text-right">Fee</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <Td className="text-[13px] font-medium">{b.amenity}</Td>
                <Td className="text-[13px] text-text-2">{b.residentName}</Td>
                <Td><DomainStatus type="booking" status={b.status} /></Td>
                <Td className="max-[560px]:hidden"><Mono className="text-[12.5px]">{fmt(b.slot)}</Mono></Td>
                <Td className="text-right"><Money value={b.fee} /></Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

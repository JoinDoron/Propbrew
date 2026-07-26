import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { Button, Card, CardHeader, Table, Td, Th, TableRow, Mono } from '@/components/ui';
import { DomainStatus, Money } from '@/components/domain';
import { Plus } from 'lucide-react';

/** EM-05 (resident view) — my amenity bookings (§7 O). */
export default async function MyBookingsPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const rows = repos.bookings.list(actor).items;
  return (
    <div className="max-w-[900px] mx-auto flex flex-col gap-3.5">
      <div className="flex justify-end"><Button variant="primary" icon={<Plus size={16} />}>Book an amenity</Button></div>
      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title="My bookings" subtitle="Amenities you have reserved" />
        </div>
        <Table>
          <thead><tr><Th>Amenity</Th><Th>Status</Th><Th className="max-[560px]:hidden">Slot</Th><Th className="text-right">Fee</Th></tr></thead>
          <tbody>
            {rows.map((b) => (
              <TableRow key={b.id}>
                <Td className="text-[13px] font-medium">{b.amenity}</Td>
                <Td><DomainStatus type="booking" status={b.status} /></Td>
                <Td className="max-[560px]:hidden"><Mono className="text-[12.5px]">{new Date(b.slot).toLocaleString('en-NG',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</Mono></Td>
                <Td className="text-right"><Money value={b.fee} /></Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

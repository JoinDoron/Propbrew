import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { Card, CardHeader, StatusPill, Table, Td, Th, TableRow } from '@/components/ui';
import { Money } from '@/components/domain';

/** EM-09 (vendor view) — My Listings, scoped to the vendor's own org (§7 O). */
export default async function MyListingsPage() {
  const { actor } = await requireCapability('marketplace');
  const rows = repos.listings.list(actor).items;
  return (
    <div className="max-w-[900px] mx-auto">
      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title={`${rows.length} listings`} subtitle="Your marketplace products and services" />
        </div>
        <Table>
          <thead><tr><Th>Listing</Th><Th>Category</Th><Th>Status</Th><Th className="text-right">Price</Th></tr></thead>
          <tbody>
            {rows.map((l) => (
              <TableRow key={l.id}>
                <Td className="text-[13px] font-medium">{l.title}</Td>
                <Td className="text-[13px] text-text-2">{l.category}</Td>
                <Td><StatusPill status={l.status} tone={l.status === 'active' ? 'success' : 'muted'} /></Td>
                <Td className="text-right"><Money value={l.price} /></Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

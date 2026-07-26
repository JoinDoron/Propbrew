import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { Button, Card, CardHeader, Mono, Table, Td, Th, TableRow } from '@/components/ui';
import { DomainStatus, Money } from '@/components/domain';

/** EM-09 (resident view) — browse approved listings, track own orders (§7 O). */
export default async function ResidentMarketplacePage() {
  const { actor } = await requireCapability('marketplace');
  const listings = repos.listings.list(actor).items.filter((l) => l.status === 'active');
  const orders = repos.marketplaceOrders.list(actor).items;
  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-3.5">
      <div className="grid grid-cols-1 min-[560px]:grid-cols-2 gap-3.5">
        {listings.map((l) => (
          <Card key={l.id}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-[14.5px] font-semibold">{l.title}</h3>
                <p className="text-[12px] text-text-3 mt-0.5">{l.vendorName} · {l.category}</p>
              </div>
              <span className="text-[15px] font-semibold font-mono"><Money value={l.price} /></span>
            </div>
            <Button variant="primary" className="!h-9 !text-[12px] mt-3 w-full">Order</Button>
          </Card>
        ))}
      </div>
      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0"><CardHeader title="My orders" subtitle="Your marketplace purchases" /></div>
        <Table>
          <thead><tr><Th>Order</Th><Th>Item</Th><Th>Status</Th><Th className="text-right">Amount</Th></tr></thead>
          <tbody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <Td><Mono className="font-semibold text-[13px]">{o.ref}</Mono></Td>
                <Td className="text-[13px]">{o.listingTitle}</Td>
                <Td><DomainStatus type="order" status={o.status} /></Td>
                <Td className="text-right"><Money value={o.amount} /></Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

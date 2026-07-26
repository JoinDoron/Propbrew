import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { marketplaceOrderMachine } from '@/domain/workflows';
import { legalEvents } from '@/lib/legal-events';
import { Card, CardHeader, Mono, Table, Td, Th, TableRow, StatusPill } from '@/components/ui';
import { DomainStatus, Money, ScopeBanner } from '@/components/domain';
import { InlineActions } from '@/components/inline-actions';

/** EM-09 — marketplace oversight (Should). Managers see listings and the order
 *  pipeline; the order state track is Placed → Accepted → Fulfilled → Closed. */
export default async function MarketplacePage() {
  const { actor } = await requireCapability('marketplace');
  const listings = repos.listings.list(actor).items;
  const orders = repos.marketplaceOrders.list(actor).items;

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />

      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title="Listings" subtitle="Approved vendor products and services" />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Listing</Th>
              <Th>Vendor</Th>
              <Th>Status</Th>
              <Th className="text-right">Price</Th>
            </tr>
          </thead>
          <tbody>
            {listings.map((l) => (
              <TableRow key={l.id}>
                <Td>
                  <div className="text-[13px] font-medium">{l.title}</div>
                  <div className="text-[11.5px] text-text-3">{l.category}</div>
                </Td>
                <Td className="text-[13px] text-text-2">{l.vendorName}</Td>
                <Td><StatusPill status={l.status} tone={l.status === 'active' ? 'success' : 'muted'} /></Td>
                <Td className="text-right"><Money value={l.price} /></Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>

      <Card padded={false}>
        <div className="p-4 sm:p-[18px] pb-0">
          <CardHeader title="Orders" subtitle="Resident purchases and their fulfilment" />
        </div>
        <Table>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Resident</Th>
              <Th>Item</Th>
              <Th>Status</Th>
              <Th className="text-right">Amount</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <TableRow key={o.id}>
                <Td><Mono className="font-semibold text-[13px]">{o.ref}</Mono></Td>
                <Td className="text-[13px] text-text-2">{o.residentName}</Td>
                <Td className="text-[13px]">{o.listingTitle}</Td>
                <Td><DomainStatus type="order" status={o.status} /></Td>
                <Td className="text-right"><Money value={o.amount} /></Td>
                <Td className="text-right">
                  <InlineActions machineKey="marketplace-order" id={o.id} events={legalEvents(marketplaceOrderMachine, o.status, actor)} />
                </Td>
              </TableRow>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

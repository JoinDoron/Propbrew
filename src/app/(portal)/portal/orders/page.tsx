import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { marketplaceOrderMachine } from '@/domain/workflows';
import { type Role } from '@/lib/authz';
import { ORDER_ACTIONS } from '@/domain/vendor-portal';
import { VendorOrdersWorkspace, type OrderView } from '@/components/portal/vendor-orders-workspace';

/** EM-09 (vendor view, §7 O via my_vendor_org) — Incoming Orders. Resident orders
 *  for the vendor's listings, driven through the §10 marketplace machine: Accept /
 *  Decline a placed order, then Mark fulfilled. Payment releases on fulfilment
 *  (SC-02). Orders are scoped to the vendor's org. */
export default async function VendorOrdersPage() {
  const { actor } = await requireCapability('marketplace');

  const orders: OrderView[] = repos.marketplaceOrders.list(actor).items.map((o) => ({
    id: o.id, ref: o.ref, listingTitle: o.listingTitle, residentName: o.residentName,
    status: o.status, amountMinor: o.amount.minor, currency: o.amount.currency, placedAt: o.placedAt,
    actions: Array.from(new Set(marketplaceOrderMachine.transitions.filter((t) => t.from === o.status && t.actors.includes('vendor' as Role)).map((t) => t.event)))
      .filter((e) => ORDER_ACTIONS[e])
      .map((e) => ({ event: e, ...ORDER_ACTIONS[e] })),
  }));

  return (
    <div className="max-w-[720px] mx-auto">
      <VendorOrdersWorkspace orders={orders} />
    </div>
  );
}

import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { can } from '@/lib/authz';
import { MarketplaceWorkspace, type ListingCard, type OrderCard } from '@/components/portal/marketplace-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** EM-09 (resident view, §7 O) — browse approved listings, order, and track own
 *  orders. Ordering creates a real `placed` order in the shared store (visible to
 *  the marketplace desk); a Placed→Closed tracker shows progress; reorder repeats
 *  a past order. Search + category filter over active listings. */
export default async function ResidentMarketplacePage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('marketplace');
  const listings: ListingCard[] = repos.listings.catalog(actor)
    .filter((l) => l.status === 'active')
    .map((l) => ({ id: l.id, title: l.title, vendorName: l.vendorName, vendorOrgId: l.vendorOrgId, category: l.category, priceMinor: l.price.minor, currency: l.price.currency }));
  const orders: OrderCard[] = repos.marketplaceOrders.list(actor).items
    .map((o) => ({ id: o.id, ref: o.ref, listingTitle: o.listingTitle, vendorOrgId: o.vendorOrgId, status: o.status, amountMinor: o.amount.minor, currency: o.amount.currency }));

  return (
    <div className="pb-page">
      <PageHeader title="Marketplace" subtitle="Discover estate services and track your orders." />
      <div className="w-full min-w-0 flex flex-col gap-6">
      <MarketplaceWorkspace listings={listings} orders={orders} canOrder={can(actor, 'marketplace', 'create').allowed} />
      </div>
    </div>
  );
  });
}

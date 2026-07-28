import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { MarketplaceWorkspace, type ListingCard, type OrderCard } from '@/components/portal/marketplace-workspace';

/** EM-09 (resident view, §7 O) — browse approved listings, order, and track own
 *  orders. Ordering creates a real `placed` order in the shared store (visible to
 *  the marketplace desk); a Placed→Closed tracker shows progress; reorder repeats
 *  a past order. Search + category filter over active listings. */
export default async function ResidentMarketplacePage() {
  const { actor } = await requireCapability('marketplace');
  const listings: ListingCard[] = repos.listings.catalog(actor)
    .filter((l) => l.status === 'active')
    .map((l) => ({ id: l.id, title: l.title, vendorName: l.vendorName, category: l.category, priceMinor: l.price.minor, currency: l.price.currency }));
  const orders: OrderCard[] = repos.marketplaceOrders.list(actor).items
    .map((o) => ({ id: o.id, ref: o.ref, listingTitle: o.listingTitle, status: o.status, amountMinor: o.amount.minor, currency: o.amount.currency }));

  return (
    <div className="max-w-[820px] mx-auto">
      <MarketplaceWorkspace listings={listings} orders={orders} />
    </div>
  );
}

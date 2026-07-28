import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { VendorListingsWorkspace, type ListingCard, type OrderLite } from '@/components/portal/vendor-listings-workspace';

/** EM-09 (vendor view, §7 O via my_vendor_org) — My Listings. A vendor publishes
 *  services, toggles them active/paused, and sees per-listing performance (orders
 *  + revenue) from its own scoped orders. Writes land in the shared store, so a
 *  new listing is immediately orderable by residents. */
export default async function MyListingsPage() {
  const { actor } = await requireCapability('marketplace');
  const listings: ListingCard[] = repos.listings.list(actor).items
    .map((l) => ({ id: l.id, title: l.title, category: l.category, status: l.status, priceMinor: l.price.minor, currency: l.price.currency }));
  const orders: OrderLite[] = repos.marketplaceOrders.list(actor).items
    .map((o) => ({ listingTitle: o.listingTitle, amountMinor: o.amount.minor, status: o.status }));

  return (
    <div className="max-w-[720px] mx-auto">
      <VendorListingsWorkspace listings={listings} orders={orders} />
    </div>
  );
}

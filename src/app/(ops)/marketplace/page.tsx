import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { marketplaceOrderMachine } from '@/domain/workflows';
import { legalEvents } from '@/lib/legal-events';
import { gmvSummary, vendorScores, fraudFlags } from '@/domain/marketplace';
import { CardHeader } from '@/components/ui';
import { ScopeBanner } from '@/components/domain';
import { MarketplaceWorkspace, type OrderView } from '@/components/marketplace/marketplace-workspace';

/** EM-09 / AI-E-05 — marketplace oversight. An order pipeline board drives the
 *  §10 machine (Placed → Accepted → Fulfilled → Closed), a GMV counter tracks
 *  live vs realized value, vendor scorecards rank acceptance/fulfilment, and a
 *  fraud-signal queue flags orders for HUMAN review (AI-E-05 — never auto-block,
 *  never auto-decline). Scoped (§8.2); managers manage, others read. Payout is a
 *  separate lifecycle blocked by Q3. */
export default async function MarketplacePage() {
  const { actor } = await requireCapability('marketplace');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'marketplace'));
  const listings = [...repos.listings.list(actor).items];
  const rawOrders = [...repos.marketplaceOrders.list(actor).items];
  const vendorName = new Map(listings.map((l) => [l.vendorOrgId, l.vendorName]));

  const orders: OrderView[] = rawOrders.map((o) => ({
    id: o.id, ref: o.ref, residentName: o.residentName, listingTitle: o.listingTitle,
    vendorName: vendorName.get(o.vendorOrgId) ?? o.vendorOrgId,
    status: o.status, amountMinor: o.amount.minor, currency: o.amount.currency,
    actions: legalEvents(marketplaceOrderMachine, o.status, actor),
  }));

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <CardHeader title="Marketplace" subtitle="Order pipeline, GMV, vendor scorecards and a human fraud-review queue — AI flags, never auto-blocks" />
      <MarketplaceWorkspace
        orders={orders}
        listings={listings}
        gmv={gmvSummary(rawOrders)}
        vendors={vendorScores(rawOrders, listings)}
        flags={fraudFlags(rawOrders, listings)}
        canMutate={canMutate}
      />
    </div>
  );
}

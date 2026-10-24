import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { marketplaceOrderMachine } from '@/domain/workflows';
import { legalEvents } from '@/lib/legal-events';
import { gmvSummary, vendorScores, fraudFlags } from '@/domain/marketplace';
import { PageHeader } from '@/components/ui/page-header';
import { ScopeBanner } from '@/components/domain';
import { MarketplaceWorkspace, type OrderView } from '@/components/marketplace/marketplace-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** EM-09 / AI-E-05 — marketplace oversight. The §10 order pipeline, recorded
 *  order values and vendor scorecards retain their existing data sources.
 *  Deterministic fraud signals are for HUMAN review, never auto-block/decline.
 *  Scoped (§8.2); managers manage, others read. Payout remains blocked by Q3. */
export default async function MarketplacePage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('marketplace', 'read', 'estate');
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
    <div className="pb-page">
      <PageHeader title="Marketplace" subtitle="Orders, vendor performance and rule-based signals for human review."
        scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />}
      />
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
  });
}

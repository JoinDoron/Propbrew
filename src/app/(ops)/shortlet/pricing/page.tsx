import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { PricingWorkspace, type AptRow } from '@/components/shortlet/pricing-workspace';

/** Dynamic pricing (flow idea) — operator-set seasonal rate rules per apartment
 *  (fixed / increase / decrease over a date range). Rules override the base rate
 *  for those dates; a 30-night strip shows where they bite. Operator-controlled,
 *  not algorithmic. */
export default async function ShortletPricingPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const apts = repos.shortletApartments.list(actor).items;
  const props = new Map(repos.shortletProperties.list(actor).items.map((p) => [p.id, p.name]));
  const rules = repos.shortletPricingRules.list(actor).items;

  const apartments: AptRow[] = apts.map((a) => ({
    id: a.id, name: a.name, property: props.get(a.propertyId) ?? '', baseMinor: a.nightlyRate.minor,
    rules: rules.filter((r) => r.apartmentId === a.id).map((r) => ({ id: r.id, label: r.label, fromISO: r.fromISO, toISO: r.toISO, type: r.type, amountMinor: r.amountMinor, pct: r.pct })),
  }));

  return (
    <div className="max-w-[820px] mx-auto">
      <PricingWorkspace apartments={apartments} />
    </div>
  );
}

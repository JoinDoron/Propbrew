import { can } from '@/lib/authz';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { db } from '@/server/data/store';
import { PLANS, entitlements, recommendPlan, type PlanKey } from '@/domain/shortlet';
import { PlanWorkspace, type PlanCard } from '@/components/shortlet/plan-workspace';

const ORDER: PlanKey[] = ['lite', 'starter', 'growth', 'pro', 'enterprise'];

/** FR-PL / §8 (Short-Let PMS) — plan management. Five naira tiers gated by
 *  apartment count + premium capabilities; current plan, usage vs cap, a smart
 *  recommendation, monthly/annual pricing, and self-serve upgrade/downgrade. */
export default async function ShortletPlanPage() {
  const { actor } = await requireCapability('bookings_amenities', 'read', 'shortlet');
  const apts = repos.shortletApartments.list(actor).items;
  const currentKey = db.shortletPlanKey as PlanKey;

  const usesWhatsapp = true; // messaging is configured
  const usesIcal = apts.some((a) => a.channels.length > 0);
  const rec = recommendPlan(apts.length, usesWhatsapp, usesIcal);

  const plans: PlanCard[] = PLANS.map((p) => ({ key: p.key, name: p.name, priceMonthlyMinor: p.priceMonthlyMinor, apartmentCap: p.apartmentCap, badge: p.badge, entitlements: entitlements(p.key) }));

  return (
    <div className="pb-page">
      <PageHeader title="Subscription plan" subtitle="Review apartment limits, features and naira billing options." />
      <PlanWorkspace canUpdate={can(actor, 'bookings_amenities', 'update').allowed} plans={plans} currentKey={currentKey} apartmentCount={apts.length} recommendation={rec} order={ORDER} />
    </div>
  );
}

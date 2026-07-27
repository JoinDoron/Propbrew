import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { CardHeader } from '@/components/ui';
import { ScopeBanner } from '@/components/domain';
import { VendorsExplorer } from '@/components/vendors/vendors-explorer';

/** FM-05 — vendor management. Document-expiry compliance drives an alert tone;
 *  performance metrics (jobs, SLA hit rate, rating) come straight off the org.
 *  The directory is interactive: filter, search, sort and drill into a profile. */
export default async function VendorsPage() {
  const { actor } = await requireCapability('work_orders');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'work_orders'));
  const vendors = repos.vendors.list(actor).items;

  // A vendor's assigned jobs — scoped work orders that name it as the vendor.
  const jobs = repos.workOrders.list(actor).items
    .filter((w) => w.vendorOrgId)
    .map((w) => ({ id: w.id, ref: w.ref, title: w.title, status: w.status, vendorOrgId: w.vendorOrgId }));

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />
      <CardHeader title={`${vendors.length} vendors`} subtitle="Your approved contractor network — filter, search and drill in" />
      <VendorsExplorer
        vendors={vendors.map((v) => ({ id: v.id, name: v.name, services: [...v.services], coverage: v.coverage, compliance: v.compliance, insuranceExpiry: v.insuranceExpiry, jobsCompleted: v.jobsCompleted, slaHitRate: v.slaHitRate, rating: v.rating }))}
        jobs={jobs}
        canMutate={canMutate}
      />
    </div>
  );
}

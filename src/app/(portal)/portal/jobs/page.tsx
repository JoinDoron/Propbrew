import { requireCapability } from '@/server/guard';
import { can, type Role } from '@/lib/authz';
import { repos, seed } from '@/server/data';
import { workOrderMachine } from '@/domain/workflows';
import { NOW_MS } from '@/domain/ppm';
import { JOB_ACTIONS } from '@/domain/vendor-portal';
import { VendorJobsWorkspace, type JobView } from '@/components/portal/vendor-jobs-workspace';

/** FM-05 / FM-03 (vendor view, §7 O via my_vendor_org) — My Jobs. Work assigned
 *  to the vendor's org, with live SLA countdowns and the vendor's own §10 actions
 *  (Start → Pause/Resume → Mark done), plus an earnings roll-up. The vendor drives
 *  its jobs; assignment stays manager work. */
export default async function VendorJobsPage() {
  const { actor } = await requireCapability('work_orders');
  const canTransition = can(actor, 'work_orders', 'transition').allowed;
  const unitById = new Map(seed.units.map((u) => [u.id, u.label]));

  const jobs: JobView[] = repos.workOrders.list(actor).items.map((w) => {
    const actions = canTransition
      ? Array.from(new Set(workOrderMachine.transitions.filter((t) => t.from === w.status && t.actors.includes('vendor' as Role)).map((t) => t.event)))
          .filter((e) => JOB_ACTIONS[e])
          .map((e) => ({ event: e, ...JOB_ACTIONS[e] }))
      : [];
    return {
      id: w.id, ref: w.ref, title: w.title, status: w.status, costMinor: w.cost?.minor ?? null,
      respondDueAt: w.respondDueAt, resolveDueAt: w.resolveDueAt,
      requesterName: w.requesterName, unitLabel: w.unitId ? unitById.get(w.unitId) ?? 'Estate' : 'Estate',
      actions,
    };
  });

  return (
    <div className="max-w-[720px] mx-auto">
      <VendorJobsWorkspace jobs={jobs} nowMs={NOW_MS} />
    </div>
  );
}

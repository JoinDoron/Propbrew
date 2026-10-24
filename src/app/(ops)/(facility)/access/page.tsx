import { operatingClock } from '@/server/operating-clock';
import { can } from '@/lib/authz';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';

import { visitorStats, accessThreats } from '@/domain/facility';
import { AccessWorkspace } from '@/components/facility/access-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** Access & Visitors — visitor passes with pre-registration and gate check-in/out,
 *  a live access-event feed, per-point secure/unlock control, and a one-tap estate
 *  lockdown. Overstays and forced/held/offline points are flagged. */
export default async function AccessPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('assets_ppm', 'read', 'facility');
  const clock = operatingClock();
  const points = repos.accessPoints.list(actor).items;
  const passes = repos.visitorPasses.list(actor).items;
  const events = repos.accessEvents.list(actor).items;

  const stats = visitorStats(passes, clock.nowMs);
  return (
    <div className="pb-page">
      <PageHeader title="Access &amp; visitors" subtitle="Review access points, visitor passes and gate activity." />
      <AccessWorkspace
        canCreate={can(actor, 'assets_ppm', 'create').allowed}
        canUpdate={can(actor, 'assets_ppm', 'update').allowed}
        points={[...points]}
        passes={[...passes]}
        events={[...events]}
        kpis={{
          onSite: stats.onSite,
          expectedToday: stats.expectedToday,
          online: points.filter((p) => p.status === 'online').length,
          totalPoints: points.length,
          threats: accessThreats(points).length,
        }}
        nowMs={clock.nowMs}
      />
    </div>
  );
  });
}

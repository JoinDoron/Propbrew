import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { visitorStats, accessThreats } from '@/domain/facility';
import { AccessWorkspace } from '@/components/facility/access-workspace';

/** Access & Visitors — visitor passes with pre-registration and gate check-in/out,
 *  a live access-event feed, per-point secure/unlock control, and a one-tap estate
 *  lockdown. Overstays and forced/held/offline points are flagged. */
export default async function AccessPage() {
  const { actor } = await requireCapability('assets_ppm');
  const points = repos.accessPoints.list(actor).items;
  const passes = repos.visitorPasses.list(actor).items;
  const events = repos.accessEvents.list(actor).items;

  const stats = visitorStats(passes, NOW_MS);
  return (
    <div className="max-w-[1040px] mx-auto">
      <AccessWorkspace
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
        nowMs={NOW_MS}
      />
    </div>
  );
}

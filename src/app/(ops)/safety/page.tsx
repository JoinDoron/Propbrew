import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { permitConflicts } from '@/domain/facility';
import { SafetyWorkspace } from '@/components/facility/safety-workspace';

/** Safety & Permits — permit-to-work register with automatic clash detection
 *  (overlapping permits in the same location), a lifecycle flow, and an
 *  incident log. A live safety score reflects open incidents and conflicts. */
export default async function SafetyPage() {
  const { actor } = await requireCapability('assets_ppm');
  const permits = repos.facilityPermits.list(actor).items;
  const incidents = repos.facilityIncidents.list(actor).items;

  const conflicts = permitConflicts(permits);
  const openIncidents = incidents.filter((i) => i.status === 'open');
  const majorOpen = openIncidents.filter((i) => i.severity === 'major').length;
  const safetyScore = Math.max(0, 100 - conflicts.length * 8 - openIncidents.length * 4 - majorOpen * 8);

  return (
    <div className="max-w-[980px] mx-auto">
      <SafetyWorkspace
        permits={[...permits]}
        incidents={[...incidents]}
        kpis={{
          activePermits: permits.filter((p) => p.status === 'active').length,
          openIncidents: openIncidents.length,
          safetyScore,
        }}
      />
    </div>
  );
}

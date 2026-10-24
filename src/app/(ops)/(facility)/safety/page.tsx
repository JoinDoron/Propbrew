import { can } from '@/lib/authz';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { permitConflicts } from '@/domain/facility';
import { SafetyWorkspace } from '@/components/facility/safety-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** Safety & Permits — permit-to-work register with automatic clash detection
 *  (overlapping permits in the same location), a lifecycle flow, and an
 *  incident log. A live safety score reflects open incidents and conflicts. */
export default async function SafetyPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('assets_ppm', 'read', 'facility');
  const permits = repos.facilityPermits.list(actor).items;
  const incidents = repos.facilityIncidents.list(actor).items;

  const conflicts = permitConflicts(permits);
  const openIncidents = incidents.filter((i) => i.status === 'open');
  const majorOpen = openIncidents.filter((i) => i.severity === 'major').length;
  const safetyScore = Math.max(0, 100 - conflicts.length * 8 - openIncidents.length * 4 - majorOpen * 8);

  return (
    <div className="pb-page">
      <PageHeader title="Safety &amp; permits" subtitle="Review permits, incidents and work-area conflicts." />
      <SafetyWorkspace
        canMutate={can(actor, 'assets_ppm', 'update').allowed}
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
  });
}

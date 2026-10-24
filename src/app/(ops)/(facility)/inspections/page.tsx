import { operatingClock } from '@/server/operating-clock';
import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';

import { PageHeader } from '@/components/ui/page-header';
import { ScopeBanner } from '@/components/domain';
import { InspectionsWorkspace } from '@/components/inspections/inspections-workspace';
import type { InspectionsData } from '@/components/inspections/types';
import { withDurableRead } from '@/server/data/durable-records';

/** FM-06 — inspections & compliance. A compliance-first workspace: the register
 *  shows every obligation's RAG status and expiry, an audit-readiness score rolls
 *  it up, and running an inspection marks its checklist and auto-raises a work
 *  order per failed item (FM-06 → FM-03). Everything is estate/tenant-scoped
 *  (§8.2); running/managing is Facility-Manager-gated, view is read-only. */
export default async function InspectionsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('inspections_compliance', 'read', 'facility');
  const clock = operatingClock();
  const canMutate = effectiveLevel(actor, 'inspections_compliance') === 'M' || effectiveLevel(actor, 'inspections_compliance') === 'F';

  const data: InspectionsData = {
    now: clock.dateISO,
    canMutate,
    obligations: [...repos.complianceObligations.list(actor).items],
    inspections: [...repos.inspections.list(actor).items],
  };

  return (
    <div className="pb-page">
      <PageHeader title="Inspections & Compliance" subtitle="Audit-ready — every obligation tracked to its expiry, failures raise work orders"
        scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />}
      />
      <InspectionsWorkspace {...data} />
    </div>
  );
  });
}

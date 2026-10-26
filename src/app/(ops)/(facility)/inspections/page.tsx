import { operatingClock } from '@/server/operating-clock';
import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';

import { PageHeader } from '@/components/ui/page-header';
import { ScopeBanner } from '@/components/domain';
import { InspectionsWorkspace } from '@/components/inspections/inspections-workspace';
import type { InspectionsData } from '@/components/inspections/types';
import { withDurableRead } from '@/server/data/durable-records';
import { facilityComplianceSetup, facilityComplianceConfiguration, facilityInspectionOperation, facilityComplianceHistory } from '@/server/reads/facility-compliance';
import type { Page } from '@/domain/primitives';

function allRows<T>(read: (cursor?: string | null) => Page<T>): T[] {
  const rows: T[] = [];
  let cursor: string | null | undefined;
  do { const page = read(cursor); rows.push(...page.items); cursor = page.cursor; } while (cursor !== null);
  return rows;
}

/** FM-06 — inspections & compliance. A compliance-first workspace: the register
 *  shows every obligation's RAG status and expiry, an audit-readiness score rolls
 *  it up, and running an inspection marks its checklist and auto-raises a work
 *  order per failed item (FM-06 → FM-03). Everything is estate/tenant-scoped
 *  (§8.2); running/managing is Facility-Manager-gated, view is read-only. */
export default async function InspectionsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('inspections_compliance', 'read', 'facility');
  const clock = operatingClock();
  const canMutate = can(actor, 'inspections_compliance', 'transition').allowed;

  const data: InspectionsData = {
    now: clock.dateISO,
    canMutate,
    companyId: actor.companyAccess ? actor.tenantId ?? undefined : undefined,
    setup: actor.companyAccess ? facilityComplianceSetup(actor) : undefined,
    history: actor.companyAccess ? facilityComplianceHistory(actor) : undefined,
    obligations: allRows((cursor) => repos.complianceObligations.list(actor, { cursor, limit: 200 })).map((row) => ({ ...row, configuration: facilityComplianceConfiguration(actor, row.id) })),
    inspections: allRows((cursor) => repos.inspections.list(actor, { cursor, limit: 200 })).map((row) => ({ ...row, operation: facilityInspectionOperation(actor, row.id) })),
  };

  return (
    <div className="pb-page">
      <PageHeader title="Inspections & Compliance" subtitle="Operational checks, evidence and recorded expiry dates — with follow-up work from findings"
        scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />}
      />
      <InspectionsWorkspace {...data} />
    </div>
  );
  });
}

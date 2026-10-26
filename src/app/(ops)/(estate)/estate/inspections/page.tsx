import { operatingClock } from '@/server/operating-clock';
import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';
import { listEstateWorkOrderSites } from '@/server/reads/estate-work-orders';
import type { Page } from '@/domain/primitives';

import { PageHeader } from '@/components/ui/page-header';
import { ScopeBanner } from '@/components/domain';
import { InspectionsWorkspace } from '@/components/inspections/inspections-workspace';
import type { InspectionsData } from '@/components/inspections/types';
import { withDurableRead } from '@/server/data/durable-records';
import { facilityComplianceConfiguration, facilityInspectionOperation } from '@/server/reads/facility-compliance';

function allRows<T>(read: (cursor?: string | null) => Page<T>): T[] {
  const rows: T[] = [];
  let cursor: string | null | undefined;
  do {
    const page = read(cursor);
    rows.push(...page.items);
    cursor = page.cursor;
  } while (cursor !== null);
  return rows;
}

const siteKey = (tenantId: string, siteId: string) => JSON.stringify([tenantId, siteId]);

/** Estate-owned compliance: the existing inspection lifecycle, restricted to
 * authorised Estate properties and retaining the actor's existing grant. */
export default async function EstateInspectionsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('inspections_compliance', 'read', 'estate');
  const clock = operatingClock();
  const estateSites = listEstateWorkOrderSites(actor);
  const siteKeys = new Set(estateSites.map((site) => siteKey(site.tenantId, site.id)));
  const belongsToEstate = (row: { tenantId: string; siteId: string; estateId: string }) =>
    siteKeys.has(siteKey(row.tenantId, row.siteId)) && siteKeys.has(siteKey(row.tenantId, row.estateId));
  const canMutate = can(actor, 'inspections_compliance', 'transition').allowed;

  const data: InspectionsData = {
    now: clock.dateISO,
    canMutate,
    companyId: actor.companyAccess ? actor.tenantId ?? undefined : undefined,
    workOrderBasePath: '/estate/work-orders',
    obligations: allRows((cursor) => repos.complianceObligations.list(actor, { cursor, limit: 200 })).filter(belongsToEstate).map((row) => ({ ...row, configuration: facilityComplianceConfiguration(actor, row.id) })),
    inspections: allRows((cursor) => repos.inspections.list(actor, { cursor, limit: 200 })).filter(belongsToEstate).map((row) => ({ ...row, operation: facilityInspectionOperation(actor, row.id) })),
  };

  return (
    <div className="pb-page">
      <PageHeader title="Estate inspections & compliance" subtitle="Property obligations, evidence and inspection outcomes — without leaving Estate."
        scope={<ScopeBanner label={`${estateSites.length} authorised estate propert${estateSites.length === 1 ? 'y' : 'ies'}`} />}
      />
      <InspectionsWorkspace {...data} />
    </div>
  );
  });
}

import 'server-only';
import { assertCan, matchesScope, type Actor } from '@/lib/authz';
import type { Asset, PpmPlan } from '@/domain/entities';
import { facilityMaintenanceState, maintenanceMetadataForPlan, metadataBindingValid, maintenancePlanMatchesMetadata, type FacilityServiceRecord, type MaintenancePlanMetadata } from '@/domain/facility/maintenance';
import { currentRecordContext } from '@/server/data/record-context';
export type MaintenanceAssetOption = { id: string; name: string; siteId: string; unitId: string | null; locationLabel: string };
export type MaintenancePlanSetup = MaintenancePlanMetadata & { needsReview: boolean };
export type MaintenanceSetupData = { companyId: string; assets: MaintenanceAssetOption[]; plans: MaintenancePlanSetup[]; services: FacilityServiceRecord[]; archivedOccurrenceIds: string[] };
export function readFacilityMaintenanceSetup(actor: Actor): MaintenanceSetupData | undefined {
  const context = currentRecordContext();
  if (!context || !actor.tenantId || context.domainTenantId !== actor.tenantId) return undefined;
  const scope = assertCan(actor, 'assets_ppm', 'read'), data = facilityMaintenanceState(context.state, actor.tenantId);
  const assets = ((context.state.collections.assets ?? []) as Asset[]).filter((row) => row.tenantId === actor.tenantId && !row.archivedAt && row.status !== 'archived' && matchesScope(row, scope));
  const plans = (context.state.collections.ppmPlans as PpmPlan[]).filter((row) => matchesScope(row, scope)).map((plan) => {
    const metadata = maintenanceMetadataForPlan(context.state, actor.tenantId!, plan);
    return { ...metadata, needsReview: !maintenancePlanMatchesMetadata(plan, metadata) || !metadataBindingValid(context.state, actor.tenantId!, metadata) };
  });
  return { companyId: actor.tenantId, assets: assets.map((row) => ({ id: String(row.id), name: row.name, siteId: String(row.siteId), unitId: row.unitId ? String(row.unitId) : null, locationLabel: row.locationLabel })),
    plans, archivedOccurrenceIds: [...data.archivedOccurrenceIds], services: data.services.filter((row) => matchesScope(row, scope)).map((row) => structuredClone(row)).sort((a, b) => b.at.localeCompare(a.at)) };
}

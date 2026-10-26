import { z } from 'zod';
import type { Asset, PpmPlan, Site, Unit, WorkOrder } from '@/domain/entities';
import type { AssetRuntime, PpmOccurrence } from '@/domain/ppm';
import type { WorkspaceRecordState } from '@/server/data/record-context';
import type { FacilityEvidence } from '@/domain/facility/evidence';

export const MAINTENANCE_SIDECAR = 'facilityMaintenance';
export const maintenanceText = z.string().trim().min(2).max(240).refine((v) => !/[\u0000-\u001f\u007f]/.test(v));
export const maintenanceDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => v >= '1900-01-01' && v <= '2100-12-31' && Number.isFinite(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v);
export const maintenanceFrequency = z.enum(['weekly', 'monthly', 'quarterly', 'biannual', 'annual']);
export const maintenanceBasis = z.enum(['calendar', 'runtime', 'both']);
export type MaintenanceActor = { id: string; name: string; role: string; at?: string; estateIds?: readonly string[] };
export type MaintenancePlanMetadata = {
  planId: string; tenantId: string; assetId: string; siteId: string; unitId: string | null; title: string;
  enabled: boolean; autoGenerate: boolean; version: number; anchorDate: string; every: number; nextCycleIndex: number;
  baselineRuntimeHours: number; createdAt: string; updatedAt: string;
};
export type FacilityServiceRecord = {
  id: string; tenantId: string; planId: string; occurrenceId: string; assetId: string; siteId: string; title: string;
  servicedOn: string; checkedIds: string[]; evidence: FacilityEvidence[]; runtimeAtService: number | null; notes: string;
  actorId: string; actorName: string; at: string; workOrderRef?: string;
};
export type FacilityMaintenanceState = {
  tenantId: string; plans: MaintenancePlanMetadata[]; services: FacilityServiceRecord[];
  receipts: { tenantId: string; actorId: string; key: string; kind: string; hash: string; resultId: string }[];
  runtimeReadings: { tenantId: string; assetId: string; hours: number; actorId: string; at: string }[];
  audit: { tenantId: string; entityId: string; actorId: string; action: string; at: string; note?: string }[];
  archivedOccurrenceIds: string[];
};
const metaSchema = z.strictObject({ planId: z.string().min(1), tenantId: z.string().min(1), assetId: z.string().min(1), siteId: z.string().min(1), unitId: z.string().nullable(), title: maintenanceText,
  enabled: z.boolean(), autoGenerate: z.boolean(), version: z.number().int().positive(), anchorDate: maintenanceDate, every: z.number().int().min(1).max(12), nextCycleIndex: z.number().int().min(0).max(11000), baselineRuntimeHours: z.number().finite().min(0).max(100_000_000), createdAt: z.string(), updatedAt: z.string(),
});
export function facilityMaintenanceState(state: WorkspaceRecordState, tenantId: string, create = false): FacilityMaintenanceState {
  const raw = state.auxiliary[MAINTENANCE_SIDECAR];
  if (raw === undefined) {
    const empty: FacilityMaintenanceState = { tenantId, plans: [], services: [], receipts: [], runtimeReadings: [], audit: [], archivedOccurrenceIds: [] };
    if (create) state.auxiliary[MAINTENANCE_SIDECAR] = empty;
    return empty;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('The maintenance register is unavailable.');
  const data = raw as FacilityMaintenanceState;
  if (data.tenantId !== tenantId || !Array.isArray(data.plans) || !Array.isArray(data.services) || !Array.isArray(data.receipts) || !Array.isArray(data.runtimeReadings) || !Array.isArray(data.audit) || !Array.isArray(data.archivedOccurrenceIds)
    || data.services.some((row) => row.tenantId !== tenantId) || data.receipts.some((row) => row.tenantId !== tenantId) || data.runtimeReadings.some((row) => row.tenantId !== tenantId) || data.audit.some((row) => row.tenantId !== tenantId)) throw new Error('Maintenance records belong to another company.');
  for (const meta of data.plans) if (metaSchema.parse(meta).tenantId !== tenantId) throw new Error('Maintenance records belong to another company.');
  return data;
}
/** Calculate from the original anchor, never by adding approximated month days. */
export function maintenanceCycleDate(anchor: string, frequency: string, every: number, index: number): string {
  maintenanceDate.parse(anchor);
  if (!maintenanceFrequency.safeParse(frequency).success || !Number.isInteger(every) || every < 1 || every > 12 || !Number.isInteger(index) || index < 0 || index > 11000) throw new Error('Invalid maintenance cadence.');
  if (frequency === 'weekly') return new Date(Date.parse(`${anchor}T00:00:00Z`) + index * every * 7 * 86_400_000).toISOString().slice(0, 10);
  const [year, month, day] = anchor.split('-').map(Number), step = ({ monthly: 1, quarterly: 3, biannual: 6, annual: 12 } as Record<string, number>)[frequency];
  const absolute = year * 12 + month - 1 + index * every * step, y = Math.floor(absolute / 12), m = absolute % 12;
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(Math.min(day, new Date(Date.UTC(y, m + 1, 0)).getUTCDate())).padStart(2, '0')}`;
}
export function maintenanceAddDays(iso: string, count: number): string { return new Date(Date.parse(`${iso}T00:00:00Z`) + count * 86_400_000).toISOString().slice(0, 10); }
export function maintenanceAsset(state: WorkspaceRecordState, tenantId: string, assetId: string): Asset | null {
  return ((state.collections.assets ?? []) as Asset[]).find((row) => row.tenantId === tenantId && String(row.id) === assetId && row.status !== 'archived' && !row.archivedAt) ?? null;
}
/** Read-only compatibility projection. Persist it only after a manager acts. */
export function maintenanceMetadataForPlan(state: WorkspaceRecordState, tenantId: string, plan: PpmPlan): MaintenancePlanMetadata {
  const existing = facilityMaintenanceState(state, tenantId).plans.find((row) => row.planId === String(plan.id));
  if (existing) return existing;
  const asset = maintenanceAsset(state, tenantId, String(plan.assetId));
  const feed = (state.collections.assetRuntime as AssetRuntime[]).find((row) => row.tenantId === tenantId && String(row.assetId) === String(plan.assetId));
  return { planId: String(plan.id), tenantId, assetId: String(plan.assetId), siteId: String(plan.siteId), unitId: asset?.unitId ? String(asset.unitId) : null, title: `${plan.assetName} service`,
    enabled: true, autoGenerate: false, version: 0, anchorDate: plan.nextDue, every: 1, nextCycleIndex: 0, baselineRuntimeHours: feed?.runtimeHoursAtLastService ?? 0, createdAt: '', updatedAt: '' };
}
export function metadataBindingValid(state: WorkspaceRecordState, tenantId: string, meta: MaintenancePlanMetadata): boolean {
  const asset = maintenanceAsset(state, tenantId, meta.assetId);
  const site = (state.collections.sites as Site[]).find((row) => row.tenantId === tenantId && String(row.id) === meta.siteId);
  const unit = meta.unitId ? (state.collections.units as Unit[]).find((row) => row.tenantId === tenantId && String(row.id) === meta.unitId && String(row.siteId) === meta.siteId) : null;
  return Boolean(asset && site && (!meta.unitId || unit) && String(asset.siteId) === meta.siteId && (asset.unitId ? String(asset.unitId) : null) === meta.unitId);
}
export function maintenancePlanMatchesMetadata(plan: PpmPlan, meta: MaintenancePlanMetadata): boolean {
  return plan.tenantId === meta.tenantId && String(plan.id) === meta.planId && String(plan.assetId) === meta.assetId && String(plan.siteId) === meta.siteId;
}
export function maintenancePlanOccurrence(state: WorkspaceRecordState, tenantId: string, planId: string): PpmOccurrence | undefined {
  const data = facilityMaintenanceState(state, tenantId);
  return (state.collections.ppmOccurrences as PpmOccurrence[]).filter((row) => row.tenantId === tenantId && String(row.planId) === planId && row.status !== 'completed' && !data.archivedOccurrenceIds.includes(row.id)).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
}
function history(state: WorkspaceRecordState, tenantId: string, machine: string, id: string, event: string, from: string | null, to: string, actor: MaintenanceActor, at: string, note: string) {
  const key = `${tenantId}:${machine}:${id}`, entries = state.history[key] ?? [];
  entries.push({ seq: entries.length, at, event, from, to, actorId: actor.id, actorName: actor.name, actorRole: actor.role, note }); state.history[key] = entries;
}
export function createMaintenanceWorkOrder(state: WorkspaceRecordState, tenantId: string, occurrenceId: string, actor: MaintenanceActor, at: string): { created: boolean; ref: string } {
  const occurrence = (state.collections.ppmOccurrences as PpmOccurrence[]).find((row) => row.tenantId === tenantId && row.id === occurrenceId && row.status !== 'completed');
  if (!occurrence) throw new Error('The maintenance occurrence is unavailable.');
  const jobs = state.collections.workOrders as WorkOrder[];
  if (occurrence.workOrderRef) {
    const linked = jobs.find((row) => row.tenantId === tenantId && row.ref === occurrence.workOrderRef && String(row.assetId) === String(occurrence.assetId));
    if (!linked) throw new Error('The linked maintenance work order needs review.');
    return { created: false, ref: linked.ref };
  }
  const id = `wo-ppm-${occurrence.id}`;
  const existing = jobs.find((row) => row.tenantId === tenantId && String(row.id) === id);
  if (existing) { occurrence.workOrderRef = existing.ref; occurrence.status = 'wo_generated'; return { created: false, ref: existing.ref }; }
  const sequenceKey = 'facility:maintenance:work-order';
  const highest = jobs.reduce((max, row) => /^WO-M\d+$/.test(row.ref) ? Math.max(max, Number(row.ref.slice(4))) : max, state.sequences[sequenceKey] ?? 0);
  if (!Number.isSafeInteger(highest) || highest > Number.MAX_SAFE_INTEGER - 2) throw new Error('Maintenance references need administrator review.');
  state.sequences[sequenceKey] = highest + 1;
  const ref = `WO-M${String(highest + 1).padStart(6, '0')}`;
  const job = { tenantId, id, ref, title: `PPM · ${occurrence.assetName}`, siteId: occurrence.siteId, estateId: occurrence.siteId, assetId: occurrence.assetId, assetName: occurrence.assetName,
    createdAt: at, updatedAt: at, createdBy: actor.id, updatedBy: actor.id, status: 'new', priority: 'routine', origin: 'ppm_schedule', requesterUserId: actor.id,
    requesterName: actor.name, assigneeName: 'Unassigned', respondDueAt: `${occurrence.dueDate}T09:00:00+01:00`, resolveDueAt: `${maintenanceAddDays(occurrence.dueDate, 1)}T18:00:00+01:00`, cost: null,
  } as unknown as WorkOrder;
  jobs.push(job); const from = occurrence.status; occurrence.workOrderRef = ref; occurrence.status = 'wo_generated';
  history(state, tenantId, 'work-order', id, 'CREATE', null, 'new', actor, at, `Created for maintenance occurrence ${occurrence.id}. No assignee was inferred.`);
  history(state, tenantId, 'ppm', String(occurrence.planId), 'GENERATE', from, 'wo_generated', actor, at, `Maintenance work order ${ref}.`);
  return { created: true, ref };
}
/** Maintain a single pending occurrence per managed plan and optionally dispatch
 * its work order. Does not complete service, mutate assets or infer evidence. */
export function processDueFacilityMaintenance(state: WorkspaceRecordState, tenantId: string, todayISO: string, actor: MaintenanceActor): { created: number; projected: number; remainingDue: number; skipped: number } {
  maintenanceDate.parse(todayISO);
  const at = actor.at ?? `${todayISO}T00:00:00Z`; if (!Number.isFinite(Date.parse(at))) throw new Error('A valid maintenance timestamp is required.');
  const data = facilityMaintenanceState(state, tenantId); let created = 0, projected = 0, skipped = 0, remainingDue = 0;
  for (const meta of data.plans.filter((row) => row.enabled && (actor.estateIds === undefined || actor.estateIds.includes(row.siteId)))) {
    const plan = (state.collections.ppmPlans as PpmPlan[]).find((row) => row.tenantId === tenantId && String(row.id) === meta.planId);
    if (!plan || !maintenancePlanMatchesMetadata(plan, meta) || !metadataBindingValid(state, tenantId, meta)) { skipped++; continue; }
    const feed = (state.collections.assetRuntime as AssetRuntime[]).find((row) => row.tenantId === tenantId && String(row.assetId) === meta.assetId);
    const runtimeDue = plan.basis !== 'calendar' && feed && plan.runtimeIntervalHours && Math.round(feed.runtimeHours * 100) - Math.round(meta.baselineRuntimeHours * 100) >= Math.round(plan.runtimeIntervalHours * 100);
    const calendarDate = maintenanceCycleDate(meta.anchorDate, plan.frequency, meta.every, meta.nextCycleIndex);
    if (calendarDate > '2100-12-31') continue;
    let occurrence = maintenancePlanOccurrence(state, tenantId, meta.planId);
    if (!occurrence && (plan.basis !== 'runtime' || runtimeDue)) {
      const due = runtimeDue && (plan.basis === 'runtime' || todayISO < calendarDate) ? todayISO : calendarDate;
      occurrence = { tenantId, id: `occ-${meta.planId}-v${meta.version}-${meta.nextCycleIndex}`, planId: plan.id, assetId: plan.assetId, assetName: plan.assetName, siteId: plan.siteId, buildingId: plan.buildingId,
        category: plan.category, frequency: plan.frequency, dueDate: due, generateDate: runtimeDue && due === todayISO ? todayISO : maintenanceAddDays(due, -plan.leadTimeDays), basisWon: runtimeDue && due === todayISO ? 'runtime' : 'calendar',
        labourHours: plan.estimatedHours, statutory: plan.statutory, statutoryDeadline: plan.statutoryDeadline, status: due < todayISO ? 'overdue' : 'scheduled', source: 'plan' };
      (state.collections.ppmOccurrences as PpmOccurrence[]).push(occurrence); projected++;
    }
    if (!occurrence) continue;
    if (runtimeDue && occurrence.dueDate > todayISO && !occurrence.workOrderRef) { occurrence.dueDate = todayISO; occurrence.generateDate = todayISO; occurrence.basisWon = 'runtime'; }
    if (!occurrence.workOrderRef) occurrence.status = occurrence.dueDate < todayISO ? 'overdue' : 'scheduled';
    plan.nextDue = occurrence.dueDate; plan.overdue = occurrence.dueDate < todayISO;
    if (meta.autoGenerate && occurrence.generateDate <= todayISO && !occurrence.workOrderRef) {
      if (created >= 24) { remainingDue++; continue; }
      if (createMaintenanceWorkOrder(state, tenantId, occurrence.id, actor, at).created) {
        created++; data.audit.push({ tenantId, entityId: occurrence.id, actorId: actor.id, action: 'maintenance.work_order_generated', at });
      }
    }
  }
  return { created, projected, remainingDue, skipped };
}
/** Calendar cadence stays anchored after early or late servicing. Missed dates
 * are not fabricated as completed work. */
export function advanceMaintenanceAfterService(plan: PpmPlan, meta: MaintenancePlanMetadata, servicedOn: string): void {
  meta.nextCycleIndex++;
  while (maintenanceCycleDate(meta.anchorDate, plan.frequency, meta.every, meta.nextCycleIndex) <= servicedOn && meta.nextCycleIndex < 11000) meta.nextCycleIndex++;
  plan.nextDue = maintenanceCycleDate(meta.anchorDate, plan.frequency, meta.every, meta.nextCycleIndex); plan.lastServicedAt = servicedOn; plan.overdue = false;
}

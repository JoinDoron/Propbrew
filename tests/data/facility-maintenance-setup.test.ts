import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember, type CompanyModuleGrants } from '@/lib/auth/company-policy';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import type { CompanyPrincipal } from '@/server/auth/company';
import type { Asset, PpmPlan, WorkOrder } from '@/domain/entities';
import type { AssetRuntime, PpmOccurrence } from '@/domain/ppm';
import { facilityMaintenanceState, maintenancePlanOccurrence } from '@/domain/facility/maintenance';
import { readFacilityMaintenanceSetup } from '@/server/reads/facility-maintenance';
import { completePpmOccurrence, generatePpmWorkOrder, logRuntimeReading } from '@/server/actions/ppm';
const boundary = vi.hoisted(() => ({ getActor: vi.fn(), getSession: vi.fn(), requireWorkspace: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.getActor, getSession: boundary.getSession }));
vi.mock('@/server/workspaces', () => ({ requireWorkspace: boundary.requireWorkspace }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { createFacilityMaintenancePlan, updateFacilityMaintenancePlan, setFacilityMaintenancePlanEnabled, recordFacilityService, recordFacilityRuntimeReading, refreshFacilityMaintenance } from '@/server/actions/facility-maintenance-setup';
const tenantId = '74700000-0000-4000-8000-000000000001', userId = '74700000-0000-4000-8000-000000000002';
let state: WorkspaceRecordState;
function run<T>(fn: () => T, modules: CompanyModuleGrants = { facility: 'manage' }, siteIds?: string[]) {
  const membership = { membershipId: 'maintenance-member', userId, companyId: tenantId, companyRole: 'member' as const, status: 'active' as const, companyStatus: 'active' as const, estateIds: siteIds ?? [], allEstates: siteIds === undefined, modules };
  const actor = actorForCompanyMember(membership, userId)!; boundary.getActor.mockResolvedValue(actor); boundary.requireWorkspace.mockResolvedValue({ actor, key: 'facility', label: 'QA facility manager' });
  const principal: CompanyPrincipal = { actor, user: { id: userId, name: 'QA facility manager', email: 'qa@example.invalid' }, company: { id: tenantId, name: 'QA company' }, session: { id: randomUUID() }, sandbox: undefined, membership: { ...membership, version: '1' } };
  return runWithRecordContext({ state, domainTenantId: tenantId, mode: 'write', companyPrincipal: principal }, fn);
}
const data = () => facilityMaintenanceState(state, tenantId);
const asset = () => (state.collections.assets as Asset[])[0];
const config = () => ({ expectedCompanyId: tenantId, expectedSiteId: String(asset().siteId), expectedUnitId: asset().unitId ? String(asset().unitId) : null, assetId: String(asset().id), title: 'Generator service', frequency: 'monthly', every: 1, basis: 'calendar', firstDue: '2026-10-31', leadTimeDays: 0, estimatedHours: 2, runtimeIntervalHours: null, checklist: [{ label: 'Inspect oil and cooling', requiresPhoto: false }], evidenceRequired: false, autoGenerate: false });
async function create(overrides = {}) { const value = { ...config(), ...overrides, idempotencyKey: randomUUID() }, result = await run(() => createFacilityMaintenancePlan(value)); expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.error); return { value, plan: (state.collections.ppmPlans as PpmPlan[]).find((p) => p.id === result.id)!, meta: data().plans.find((p) => p.planId === result.id)! }; }
beforeEach(() => { vi.stubEnv('PROPBREW_AUTH_MODE', 'company'); vi.stubEnv('PROPBREW_REVIEW_MODE', '0'); vi.stubEnv('DATA_SOURCE', 'postgres'); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-25T23:30:00Z')); state = createDemoWorkspaceState(tenantId); state.collections.ppmPlans = []; state.collections.ppmOccurrences = []; state.collections.workOrders = []; state.collections.assetRuntime = []; vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('Facility maintenance native setup', () => {
  it('creates one exact company-bound plan and occurrence with replay protection', async () => {
    const { value, plan, meta } = await create(); expect(await run(() => createFacilityMaintenancePlan(value))).toMatchObject({ ok: true, id: plan.id });
    expect(data().plans).toHaveLength(1); expect(state.collections.ppmOccurrences).toHaveLength(1); expect(meta).toMatchObject({ anchorDate: '2026-10-31', version: 1 });
    expect(await run(() => createFacilityMaintenancePlan({ ...value, title: 'Different replay' }))).toMatchObject({ ok: false });
    expect(data().audit[0].at).toBe('2026-10-25T23:30:00.000Z');
  });
  it('rejects stale company/location, invalid dates, duplicate checklist, unknown fields and viewers', async () => {
    const value = { ...config(), idempotencyKey: randomUUID() };
    for (const change of [{ expectedCompanyId: 'foreign' }, { expectedSiteId: 'foreign' }, { expectedUnitId: 'moved-unit' }, { firstDue: '2026-02-30' }, { every: 0 }, { actorId: 'forged' }, { checklist: [{ label: 'Check oil', requiresPhoto: false }, { label: 'check oil', requiresPhoto: true }] }]) expect(await run(() => createFacilityMaintenancePlan({ ...value, ...change }))).toMatchObject({ ok: false });
    await expect(run(() => createFacilityMaintenancePlan(value), { facility: 'view' })).rejects.toThrow('cannot perform');
    expect(await run(() => createFacilityMaintenancePlan(value), { facility: 'manage' }, ['foreign-site'])).toMatchObject({ ok: false }); expect(state.collections.ppmPlans).toHaveLength(0);
  });
  it('edits future configuration and blocks stale edit replay', async () => {
    const { plan, meta } = await create(), value = { ...config(), planId: String(plan.id), expectedVersion: meta.version, firstDue: '2027-01-31', title: 'Updated plan' };
    expect(await run(() => updateFacilityMaintenancePlan(value))).toMatchObject({ ok: true }); expect(meta.version).toBe(2); expect(data().archivedOccurrenceIds).toHaveLength(1);
    expect(await run(() => updateFacilityMaintenancePlan(value))).toMatchObject({ ok: false }); expect(maintenancePlanOccurrence(state, tenantId, String(plan.id))?.dueDate).toBe('2027-01-31');
    const pending = maintenancePlanOccurrence(state, tenantId, String(plan.id))!, archived = data().archivedOccurrenceIds[0]; expect(pending.id).not.toBe(archived);
    await run(() => refreshFacilityMaintenance({ expectedCompanyId: tenantId })); await run(() => refreshFacilityMaintenance({ expectedCompanyId: tenantId }));
    expect((state.collections.ppmOccurrences as PpmOccurrence[]).filter((row) => !data().archivedOccurrenceIds.includes(row.id))).toHaveLength(1);
    expect(await run(() => generatePpmWorkOrder(pending.id, tenantId))).toMatchObject({ ok: true }); expect(await run(() => generatePpmWorkOrder(pending.id, tenantId))).toMatchObject({ ok: true }); expect(state.collections.workOrders).toHaveLength(1);
  });
  it('pauses and resumes without generating a historical backlog or losing occurrences', async () => {
    const { plan, meta } = await create({ firstDue: '2026-01-31' }), fields = { ...config(), planId: String(plan.id) };
    const binding = { expectedCompanyId: fields.expectedCompanyId, expectedSiteId: fields.expectedSiteId, expectedUnitId: fields.expectedUnitId, assetId: fields.assetId, planId: fields.planId };
    expect(await run(() => setFacilityMaintenancePlanEnabled({ ...binding, expectedVersion: meta.version, enabled: false }))).toMatchObject({ ok: true });
    expect(await run(() => setFacilityMaintenancePlanEnabled({ ...binding, expectedVersion: meta.version, enabled: true }))).toMatchObject({ ok: true });
    expect(maintenancePlanOccurrence(state, tenantId, String(plan.id))?.dueDate).toBe('2026-10-31'); expect(data().archivedOccurrenceIds).not.toContain(maintenancePlanOccurrence(state, tenantId, String(plan.id))?.id); expect(state.collections.workOrders).toHaveLength(0);
  });
  it('records actual checklist service once and advances the original month anchor', async () => {
    const { plan, meta } = await create({ firstDue: '2026-07-31' }); const occurrence = maintenancePlanOccurrence(state, tenantId, String(plan.id))!;
    const value = { expectedCompanyId: tenantId, expectedSiteId: String(asset().siteId), expectedUnitId: asset().unitId ? String(asset().unitId) : null, assetId: String(asset().id), planId: String(plan.id), occurrenceId: occurrence.id, expectedPlanVersion: meta.version, checkedIds: plan.checklist.map((p) => p.id), evidenceIds: [], servicedOn: '2026-10-26', runtimeAtService: null, notes: 'Oil inspected and service completed', idempotencyKey: randomUUID() };
    expect(await run(() => recordFacilityService(value))).toMatchObject({ ok: true }); expect(await run(() => recordFacilityService(value))).toMatchObject({ ok: true });
    expect(data().services).toHaveLength(1); expect(plan.lastServicedAt).toBe('2026-10-26'); expect(plan.nextDue).toBe('2026-10-31'); expect(occurrence.status).toBe('completed');
    expect(await run(() => recordFacilityService({ ...value, idempotencyKey: randomUUID() }))).toMatchObject({ ok: false });
  });
  it('requires stored asset image evidence and refuses native fabricated photo counts', async () => {
    const { plan, meta } = await create({ evidenceRequired: true }); const occ = maintenancePlanOccurrence(state, tenantId, String(plan.id))!;
    expect(await run(() => completePpmOccurrence(occ.id, { checkedIds: plan.checklist.map((p) => p.id), photoCount: 100 }))).toMatchObject({ ok: false });
    const fields = { expectedCompanyId: tenantId, expectedSiteId: String(asset().siteId), expectedUnitId: asset().unitId ? String(asset().unitId) : null, assetId: String(asset().id), planId: String(plan.id), occurrenceId: occ.id, expectedPlanVersion: meta.version, checkedIds: plan.checklist.map((p) => p.id), servicedOn: '2026-10-26', runtimeAtService: null, notes: '', idempotencyKey: randomUUID() };
    expect(await run(() => recordFacilityService({ ...fields, evidenceIds: [] }))).toMatchObject({ ok: false });
    expect(await run(() => recordFacilityService({ ...fields, evidenceIds: ['foreign-photo'] }))).toMatchObject({ ok: false }); expect(data().services).toHaveLength(0);
    const id = randomUUID(); state.auxiliary.facilityEvidence = { files: [{ id, tenantId, siteId: String(asset().siteId), resourceType: 'asset', resourceId: String(asset().id), kind: 'image', url: `/api/facility/evidence/${id}`, name: 'actual.png', contentType: 'image/png', size: 64, sha256: 'a'.repeat(64), createdAt: '2026-10-26T00:00:00Z', createdBy: userId }], receipts: [] };
    expect(await run(() => recordFacilityService({ ...fields, evidenceIds: [id] }))).toMatchObject({ ok: true }); expect(data().services[0].evidence[0].id).toBe(id);
  });
  it('requires linked work orders to be resolved, without silently closing or merging jobs', async () => {
    const { plan, meta } = await create({ firstDue: '2026-10-26' }), occ = maintenancePlanOccurrence(state, tenantId, String(plan.id))!;
    expect(await run(() => generatePpmWorkOrder(occ.id))).toMatchObject({ ok: false }); expect(await run(() => generatePpmWorkOrder(occ.id, tenantId))).toMatchObject({ ok: true });
    const value = { expectedCompanyId: tenantId, expectedSiteId: String(asset().siteId), expectedUnitId: asset().unitId ? String(asset().unitId) : null, assetId: String(asset().id), planId: String(plan.id), occurrenceId: occ.id, expectedPlanVersion: meta.version, checkedIds: plan.checklist.map((p) => p.id), evidenceIds: [], servicedOn: '2026-10-26', runtimeAtService: null, notes: '', idempotencyKey: randomUUID() };
    expect(await run(() => recordFacilityService(value))).toMatchObject({ ok: false }); const job = (state.collections.workOrders as WorkOrder[])[0]; job.status = 'resolved';
    expect(await run(() => recordFacilityService(value))).toMatchObject({ ok: true }); expect(job.status).toBe('resolved');
  });
  it('records absolute runtime safely and uses separate per-plan service baselines', async () => {
    const { plan } = await create({ basis: 'runtime', runtimeIntervalHours: 0.29 });
    const value = { expectedCompanyId: tenantId, expectedSiteId: String(asset().siteId), expectedUnitId: asset().unitId ? String(asset().unitId) : null, assetId: String(asset().id), readingHours: 0.29, expectedPreviousHours: 0, idempotencyKey: randomUUID() };
    expect(await run(() => recordFacilityRuntimeReading(value))).toMatchObject({ ok: true }); expect(await run(() => recordFacilityRuntimeReading(value))).toMatchObject({ ok: true }); expect((state.collections.assetRuntime as AssetRuntime[])[0].runtimeHours).toBe(0.29);
    expect(await run(() => logRuntimeReading(String(plan.assetId), 100))).toMatchObject({ ok: false });
    expect(await run(() => recordFacilityRuntimeReading({ ...value, idempotencyKey: randomUUID(), readingHours: 0.1 }))).toMatchObject({ ok: false }); expect(state.collections.ppmOccurrences).toHaveLength(1);
  });
  it('reads current records without writes and excludes services outside assigned sites', async () => {
    await create(); const before = structuredClone(state); const result = await run(async () => readFacilityMaintenanceSetup(await boundary.getActor())); expect(result?.plans).toHaveLength(1); expect(state).toEqual(before);
    expect((await run(async () => readFacilityMaintenanceSetup(await boundary.getActor()), { facility: 'manage' }, ['foreign-site']))?.plans).toHaveLength(0);
  });
});

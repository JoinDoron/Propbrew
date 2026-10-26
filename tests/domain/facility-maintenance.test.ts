import { describe, expect, it } from 'vitest';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import type { Asset, PpmPlan } from '@/domain/entities';
import type { PpmOccurrence, AssetRuntime } from '@/domain/ppm';
import { advanceMaintenanceAfterService, facilityMaintenanceState, maintenanceCycleDate, metadataBindingValid, processDueFacilityMaintenance, type MaintenancePlanMetadata } from '@/domain/facility/maintenance';
const company = '74700000-0000-4000-8000-000000000001';
const actor = { id: 'system:test', name: 'Test worker', role: 'system_timer', at: '2026-10-26T10:30:00.000Z' };
function fixture() {
  const state = createDemoWorkspaceState(company), asset = (state.collections.assets as Asset[])[0], base = (state.collections.ppmPlans as PpmPlan[])[0];
  state.collections.ppmPlans = []; state.collections.ppmOccurrences = []; state.collections.workOrders = []; state.collections.assetRuntime = [];
  const plan = { ...structuredClone(base), id: 'managed-plan', assetId: asset.id, assetName: asset.name, siteId: asset.siteId, basis: 'calendar', frequency: 'monthly', nextDue: '2026-10-26', leadTimeDays: 0, estimatedHours: 2, statutory: false, lastServicedAt: null } as unknown as PpmPlan;
  const meta: MaintenancePlanMetadata = { tenantId: company, planId: String(plan.id), assetId: String(asset.id), siteId: String(asset.siteId), unitId: asset.unitId ? String(asset.unitId) : null, title: 'Generator service', enabled: true, autoGenerate: true, version: 1, anchorDate: plan.nextDue, every: 1, nextCycleIndex: 0, baselineRuntimeHours: 0, createdAt: actor.at, updatedAt: actor.at };
  (state.collections.ppmPlans as PpmPlan[]).push(plan); facilityMaintenanceState(state, company, true).plans.push(meta); return { state, plan, meta, asset };
}
describe('Facility maintenance calendar, occurrence and worker integrity', () => {
  it('keeps original month-end anchors, leap years and custom intervals without 30-day drift', () => {
    expect([0, 1, 2, 3].map((i) => maintenanceCycleDate('2028-01-31', 'monthly', 1, i))).toEqual(['2028-01-31', '2028-02-29', '2028-03-31', '2028-04-30']);
    expect(maintenanceCycleDate('2024-02-29', 'annual', 1, 1)).toBe('2025-02-28');
    expect(maintenanceCycleDate('2024-02-29', 'annual', 1, 4)).toBe('2028-02-29');
    expect(maintenanceCycleDate('2026-01-31', 'quarterly', 2, 1)).toBe('2026-07-31');
    expect(maintenanceCycleDate('2026-10-26', 'weekly', 2, 1)).toBe('2026-11-09');
    for (const date of ['2026-02-30', '2026-13-01', '26-01-01']) expect(() => maintenanceCycleDate(date, 'monthly', 1, 1)).toThrow();
  });
  it('projects one occurrence and creates an unassigned work order once across repeated worker sweeps', () => {
    const { state, plan } = fixture(); expect(processDueFacilityMaintenance(state, company, '2026-10-26', actor)).toEqual({ created: 1, projected: 1, remainingDue: 0, skipped: 0 });
    const before = structuredClone(state); expect(processDueFacilityMaintenance(state, company, '2026-10-27', actor).created).toBe(0);
    expect(state.collections.ppmOccurrences).toHaveLength(1); expect(state.collections.workOrders).toHaveLength(1);
    expect(state.collections.workOrders).toMatchObject([{ status: 'new', assigneeName: 'Unassigned', createdAt: actor.at, assetId: plan.assetId }]);
    expect((state.collections.ppmOccurrences as PpmOccurrence[])[0].workOrderRef).toBe((before.collections.ppmOccurrences as PpmOccurrence[])[0].workOrderRef);
    expect(JSON.stringify(state.history)).toContain(actor.at);
  });
  it('does not create work orders before lead time or without automatic generation consent', () => {
    const { state, meta } = fixture(); meta.anchorDate = '2026-12-31';
    expect(processDueFacilityMaintenance(state, company, '2026-10-26', actor)).toMatchObject({ created: 0, projected: 1 });
    meta.autoGenerate = false; expect(processDueFacilityMaintenance(state, company, '2027-01-01', actor).created).toBe(0);
    meta.enabled = false; expect(processDueFacilityMaintenance(state, company, '2027-01-02', actor).created).toBe(0);
  });
  it('keeps runtime-only plans undated until an actual meter threshold is met', () => {
    const { state, plan, meta } = fixture(); plan.basis = 'runtime'; plan.runtimeIntervalHours = 0.29; meta.baselineRuntimeHours = 0.1;
    const feed = { tenantId: company, assetId: plan.assetId, runtimeHours: 0.38, runtimeHoursAtLastService: 0, dailyRuntimeHours: 0, runtimeServiceInterval: 0.29, lastReadingAt: actor.at } as AssetRuntime;
    (state.collections.assetRuntime as AssetRuntime[]).push(feed);
    expect(processDueFacilityMaintenance(state, company, '2026-10-26', actor).created).toBe(0); expect(state.collections.ppmOccurrences).toHaveLength(0);
    feed.runtimeHours = 0.39; expect(processDueFacilityMaintenance(state, company, '2026-10-26', actor)).toMatchObject({ created: 1, projected: 1 });
    expect(state.collections.ppmOccurrences).toMatchObject([{ dueDate: '2026-10-26', basisWon: 'runtime' }]);
  });
  it('isolates per-plan service baselines and rejects orphan site/unit or moved assets', () => {
    const { state, meta, asset } = fixture(); expect(metadataBindingValid(state, company, meta)).toBe(true);
    meta.unitId = 'foreign-unit'; expect(metadataBindingValid(state, company, meta)).toBe(false);
    expect(processDueFacilityMaintenance(state, company, '2026-10-26', actor)).toMatchObject({ skipped: 1, created: 0 });
    meta.unitId = asset.unitId ? String(asset.unitId) : null; state.collections.sites = []; expect(metadataBindingValid(state, company, meta)).toBe(false);
  });
  it('advances after actual late service without inventing historical completions', () => {
    const { state, plan, meta } = fixture(); meta.anchorDate = '2026-01-31';
    advanceMaintenanceAfterService(plan, meta, '2026-04-30'); expect(plan.lastServicedAt).toBe('2026-04-30'); expect(plan.nextDue).toBe('2026-05-31'); expect(meta.nextCycleIndex).toBe(4); expect(state.collections.ppmOccurrences).toHaveLength(0);
  });
  it('bounds each dispatch sweep and reports remaining due plans instead of claiming completion', () => {
    const { state, plan, meta } = fixture(); const data = facilityMaintenanceState(state, company);
    for (let i = 1; i < 26; i++) { (state.collections.ppmPlans as PpmPlan[]).push({ ...plan, id: `plan-${i}` } as unknown as PpmPlan); data.plans.push({ ...meta, planId: `plan-${i}` }); }
    expect(processDueFacilityMaintenance(state, company, '2026-10-26', actor)).toMatchObject({ created: 24, remainingDue: 2 });
    expect(processDueFacilityMaintenance(state, company, '2026-10-26', actor)).toMatchObject({ created: 2, remainingDue: 0 });
    expect(state.collections.workOrders).toHaveLength(26);
  });
  it('reads no optional sidecar without mutation and rejects another company register', () => {
    const { state } = fixture(); expect(() => facilityMaintenanceState(state, 'foreign')).toThrow('another company');
    delete state.auxiliary.facilityMaintenance; const before = structuredClone(state); expect(facilityMaintenanceState(state, company).plans).toEqual([]); expect(state).toEqual(before);
  });
});

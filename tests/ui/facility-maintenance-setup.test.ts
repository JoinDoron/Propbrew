import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { MaintenancePlanForm, ServiceHistory } from '@/components/ppm/maintenance-setup';
import { MaintenanceWorkspace } from '@/components/ppm/maintenance-workspace';
import { PpmList } from '@/components/ppm/list-view';
import { RuntimeView } from '@/components/ppm/runtime-view';
import type { PpmData } from '@/components/ppm/types';
import * as seed from '@/server/data/seed/fixtures';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/facility-maintenance-setup', () => ({ createFacilityMaintenancePlan: vi.fn(), updateFacilityMaintenancePlan: vi.fn(), setFacilityMaintenancePlanEnabled: vi.fn(), refreshFacilityMaintenance: vi.fn(), recordFacilityRuntimeReading: vi.fn(), recordFacilityService: vi.fn() }));
vi.mock('@/server/actions/ppm', () => ({ completePpmOccurrence: vi.fn(), generatePpmWorkOrder: vi.fn(), reschedulePpmOccurrence: vi.fn(), decidePpmSuggestion: vi.fn(), logRuntimeReading: vi.fn() }));
const noop = () => {}, asset = seed.assets[0], sourcePlan = seed.ppmPlans.find((p) => p.assetId === asset.id)!, plan = { ...sourcePlan, checklist: [...sourcePlan.checklist], id: 'qa-plan', assetId: String(asset.id) };
const meta = { tenantId: String(asset.tenantId), planId: plan.id, assetId: String(asset.id), siteId: String(asset.siteId), unitId: asset.unitId ? String(asset.unitId) : null, title: 'Actual generator service', enabled: true, autoGenerate: false, version: 1, every: 1, anchorDate: '2026-10-31', nextCycleIndex: 0, baselineRuntimeHours: 100, createdAt: '2026-10-26T10:00:00Z', updatedAt: '2026-10-26T10:00:00Z', needsReview: false };
const data: PpmData = { now: '2026-10-26', canMutate: true, weeklyCapacityHours: 32, occurrences: [], plans: [plan], runtime: [], gaps: [], assessments: [], setup: { companyId: String(asset.tenantId), assets: [{ id: String(asset.id), name: asset.name, locationLabel: asset.locationLabel, siteId: String(asset.siteId), unitId: meta.unitId }], plans: [meta], services: [], archivedOccurrenceIds: [] } };
describe('Facility maintenance native setup controls', () => {
  it('includes setup and service history without dropping existing page sections', () => {
    const html = renderToStaticMarkup(createElement(MaintenanceWorkspace, data)); expect(html.match(/role="tabpanel"/g)).toHaveLength(5);
    for (const label of ['Create maintenance plan', 'Review due work orders', 'Calendar', 'Runtime', 'AI risk', 'Plan register', 'Service history']) expect(html).toContain(label);
    expect(html).not.toContain('Add plan · unavailable');
  });
  it('defaults automatic work orders off and makes cadence/checklist/evidence inputs accessible', () => {
    const html = renderToStaticMarkup(createElement(MaintenancePlanForm, { data, onClose: noop }));
    for (const label of ['Plan name', 'Maintenance basis', 'First / next service date', 'Repeat every', 'Calendar interval', 'Checklist item 1', 'Photo required for item 1']) expect(html).toContain(label);
    expect(html).toContain('Enable automatic work orders when your field-team work-order process is ready'); expect(html).toContain('generated jobs remain unassigned');
    expect(html.match(/type="checkbox"[^>]*checked/g)).toBeNull(); expect(html).toContain('<fieldset'); expect(html).toContain('Calendar dates stay anchored');
  });
  it('keeps paused and runtime-only plans visible even without a pending occurrence', () => {
    const html = renderToStaticMarkup(createElement(PpmList, { data: { ...data, setup: { ...data.setup!, plans: [{ ...meta, enabled: false }] } }, onSelect: noop, onEdit: noop }));
    expect(html).toContain('Paused'); expect(html).toContain(asset.name); expect(html).toContain('Edit plan'); expect(html).toContain('Resume plan');
  });
  it('shows only real service details and protected evidence links', () => {
    const html = renderToStaticMarkup(createElement(ServiceHistory, { data: { ...data, setup: { ...data.setup!, services: [{ id: 'service', tenantId: meta.tenantId, planId: plan.id, occurrenceId: 'occ', assetId: meta.assetId, siteId: meta.siteId, title: meta.title, servicedOn: '2026-10-26', checkedIds: ['oil'], evidence: [{ id: 'file', tenantId: meta.tenantId, siteId: meta.siteId, resourceType: 'asset', resourceId: meta.assetId, name: 'Service photo.png', contentType: 'image/png', kind: 'image', size: 60, url: '/api/facility/evidence/file', sha256: 'a'.repeat(64), createdAt: meta.createdAt, createdBy: 'manager' }], runtimeAtService: 128.29, notes: 'Oil replaced', actorId: 'manager', actorName: 'Actual manager', at: meta.updatedAt }] } } }));
    expect(html).toContain('Actual manager'); expect(html).toContain('128.29 meter hours'); expect(html).toContain('Oil replaced'); expect(html).toContain('href="/api/facility/evidence/file"'); expect(html).not.toContain('demo evidence');
  });
  it('uses each plan baseline and refuses to invent a runtime forecast without a daily rate', () => {
    const html = renderToStaticMarkup(createElement(RuntimeView, { data: { ...data, plans: [{ ...plan, basis: 'runtime', runtimeIntervalHours: 250 }], runtime: [{ tenantId: asset.tenantId, assetId: asset.id, assetName: asset.name, runtimeHours: 128.29, runtimeHoursAtLastService: 0, runtimeServiceInterval: 1, dailyRuntimeHours: 0, lastReadingAt: meta.createdAt }] }, onSelect: noop }));
    expect(html).toContain('28.29'); expect(html).toContain('250h'); expect(html).toContain('No forecast without a recorded daily runtime rate'); expect(html).not.toContain('9999');
    const source = readFileSync(new URL('../../src/components/ppm/runtime-view.tsx', import.meta.url), 'utf8'); expect(source).toContain('Cumulative meter reading (h)');
  });
});

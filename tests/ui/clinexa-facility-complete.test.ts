import { createElement, type ComponentProps } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { AccessWorkspace } from '@/components/facility/access-workspace';
import { ControlCenter } from '@/components/facility/control-center';
import { EnergyWorkspace } from '@/components/facility/energy-workspace';
import { InventoryWorkspace } from '@/components/facility/inventory-workspace';
import { SafetyWorkspace } from '@/components/facility/safety-workspace';
import { SustainabilityWorkspace } from '@/components/facility/sustainability-workspace';
import { TechnicianWorkspace } from '@/components/facility/technician-workspace';
import { CopilotWorkspace } from '@/components/facility/copilot-workspace';
import { FacilityDialog } from '@/components/facility/facility-ui';
import { facilityMoney } from '@/components/facility/facility-format';
import { WorkOrdersBoard } from '@/components/work-orders/work-orders-board';
import { MaintenanceWorkspace } from '@/components/ppm/maintenance-workspace';
import { InspectionsWorkspace } from '@/components/inspections/inspections-workspace';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const view = (name: string) => read(`src/components/${name}.tsx`);
const nowMs = Date.parse('2026-07-26T09:00:00Z');
const sections = [
  ['facility/access-workspace', ['overview', 'points', 'visitors', 'feed']],
  ['facility/control-center', ['sensors', 'systems', 'alarms']],
  ['facility/energy-workspace', ['overview', 'generators', 'meters']],
  ['facility/inventory-workspace', ['overview', 'register']],
  ['facility/safety-workspace', ['permits', 'incidents']],
  ['facility/sustainability-workspace', ['performance', 'pathways', 'targets']],
  ['facility/copilot-workspace', ['conversation', 'priorities', 'usage']],
  ['facility/technician-workspace', ['now', 'next', 'waiting', 'done']],
  ['assets/assets-explorer', ['health', 'register']],
  ['spaces/spaces-explorer', ['occupancy', 'units']],
  ['vendors/vendors-explorer', ['matching', 'directory']],
  ['ppm/maintenance-workspace', ['calendar', 'runtime', 'risk', 'list']],
  ['inspections/inspections-workspace', ['compliance', 'inspections']],
] as const;

describe('Clinexa-complete Facility module', () => {
  it.each(sections)('preserves %s tabs in their original order', (file, ids) => {
    const source = view(file);
    let position = -1;
    for (const id of ids) { const next = source.indexOf(`id: '${id}'`); expect(next).toBeGreaterThan(position); position = next; }
  });

  it('composes quiet reference cards and readable typography across every inner view', () => {
    for (const [file] of sections) {
      const source = view(file);
      expect(source).not.toContain('className="pb-hero"');
      expect(source).not.toMatch(/text-\[(?:8|9|9\.5|10|10\.5|11|11\.5)px\]/);
      expect(source).toMatch(/<(?:Card|KpiCard|FacilityKpi|Kpi|HealthKpi|MaintenanceCalendar|ComplianceRegister)/);
    }
    expect(read('src/components/facility/facility-workspaces.module.css')).toContain('gap: 24px');
    expect(read('src/components/facility/facility-workspaces.module.css')).toContain('gap: 16px');
  });

  it('uses native labelled dialogs with focus restoration and pending dismissal protection', () => {
    const html = renderToStaticMarkup(createElement(FacilityDialog, { title: 'Review permit', onClose: () => {}, pending: true }, createElement('p', null, 'Confirm site conditions')));
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-label="Review permit"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Close review permit"');
    expect(html).toContain('disabled=""');
    expect(view('facility/facility-ui')).toContain('canClose={!pending}');
    expect(view('facility/facility-ui')).toContain('dismissOnBackdrop={false}');
    for (const file of ['facility/access-workspace', 'facility/energy-workspace', 'facility/inventory-workspace', 'facility/sustainability-workspace', 'ppm/plan-drawer', 'inspections/run-drawer', 'inspections/schedule-dialog', 'assets/assets-explorer']) {
      expect(view(file)).toContain('<FacilityDialog');
      expect(view(file)).not.toMatch(/className="fixed inset-0/);
    }
  });

  it('displays recorded sensor values without invented telemetry drift', () => {
    const html = renderToStaticMarkup(createElement(ControlCenter, {
      health: { score: 90, band: 'success', label: 'Healthy' }, systems: [], alarms: [],
      sensors: [{ id: 'sensor-one', name: 'Water tank', kind: 'water_tank', value: 57, unit: '%', drift: 20, siteName: 'Lagos' }],
      kpis: { operational: 0, total: 0, powerSource: 'Grid', waterPct: 57 }, nowMs,
    }));
    expect(html).toContain('57%');
    expect(html).toContain('not a connected live sensor feed');
    expect(view('facility/control-center')).not.toContain('Math.sin');
    expect(html).not.toContain('Create work order</button>');
  });

  it('keeps access controls record-only and read-only by default', () => {
    const html = renderToStaticMarkup(createElement(AccessWorkspace, { points: [], passes: [], events: [], kpis: { onSite: 0, expectedToday: 0, online: 0, totalPoints: 0, threats: 0 }, nowMs }));
    expect(html).toContain('not a connected gate controller');
    expect(html).toContain('Recorded gate activity');
    expect(html).toMatch(/disabled=""[^>]*>[^<]*(?:<[^>]*>[^<]*)*Pre-register/);
    expect(view('facility/access-workspace')).toContain('Confirm access update');
    expect(view('facility/access-workspace')).toContain('Physical gate/controller operation is not confirmed.');
  });

  it('renders all energy, inventory, safety and sustainability empty records without writes', () => {
    expect(renderToStaticMarkup(createElement(EnergyWorkspace, { generators: [], meters: [], kpis: { dieselSpendMinor: 12345, litresMonth: 0, costPerKwhMinor: 123, co2Kg: 0 }, reliance: { gensetPct: 0, gridPct: 0 }, nowMs }))).toContain('Estimated diesel cost');
    expect(renderToStaticMarkup(createElement(InventoryWorkspace, { parts: [], kpis: { total: 0, belowReorder: 0, stockValueMinor: 0, stockoutsSoon: 0 } }))).toContain('No parts match.');
    expect(renderToStaticMarkup(createElement(SafetyWorkspace, { permits: [], incidents: [], kpis: { activePermits: 0, openIncidents: 0, safetyScore: 100 } }))).toContain('No incidents logged.');
    const html = renderToStaticMarkup(createElement(SustainabilityWorkspace, { esg: { score: 0, band: 'muted', label: 'No baseline' }, kpis: { carbonKg: 0, gensetPct: 0, waterM3: 0, renewableReadiness: 0 }, months: [], mix: { gridKwh: 0, gensetKwh: 0 }, scenarios: [], targets: [] }));
    expect(html).toContain('Insufficient baseline');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });

  it('keeps every Facility mutation action aligned with the exact server action capability', () => {
    for (const route of ['access', 'control-center', 'energy', 'inventory', 'safety', 'sustainability', 'copilot']) {
      expect(read(`src/app/(ops)/(facility)/${route}/page.tsx`)).toContain("can(actor, 'assets_ppm', 'update').allowed");
    }
    for (const route of ['access', 'control-center', 'copilot']) expect(read(`src/app/(ops)/(facility)/${route}/page.tsx`)).toContain("can(actor, 'assets_ppm', 'create').allowed");
    expect(read('src/app/(ops)/(facility)/field/page.tsx')).toContain("can(actor, 'work_orders', 'transition').allowed");
    expect(read('src/app/(ops)/(facility)/copilot/page.tsx')).toContain("can(actor, 'reports_analytics', 'update').allowed");
  });

  it('requires human confirmation for terminal work, permits and AI operational actions', () => {
    expect(view('work-orders/transition-actions')).toContain("['RESOLVE', 'VERIFY', 'CLOSE', 'REJECT', 'CANCEL', 'REOPEN']");
    expect(view('work-orders/transition-actions')).toContain('<FacilityDialog');
    expect(view('facility/safety-workspace')).toContain('Confirm work is complete and the work area has been made safe');
    expect(view('facility/copilot-workspace')).toContain('Review copilot recommendation');
    expect(view('facility/copilot-workspace')).toContain('it does not place a supplier order');
  });

  it('keeps PPM calendar and table navigation keyboard reachable without compressing mobile days', () => {
    expect(view('ppm/calendar')).toContain('aria-label="Maintenance calendar, scroll horizontally for all days"');
    expect(view('ppm/calendar')).toContain('Previous maintenance month');
    expect(read('src/components/facility/facility-workspaces.module.css')).toContain('min-width: 960px');
    for (const file of ['ppm/list-view', 'inspections/inspections-list', 'work-orders/work-orders-board']) {
      expect(view(file)).toContain('role="region"'); expect(view(file)).toContain('tabIndex={0}'); expect(view(file)).toContain('scope="col"');
    }
    expect(view('ppm/list-view')).not.toMatch(/<tr[^>]*onClick/);
    expect(view('inspections/inspections-list')).not.toMatch(/<tr[^>]*onClick/);
  });

  it('keeps maintenance runtime, compliance, statutory and evidence content truthful', () => {
    const ppm = renderToStaticMarkup(createElement(MaintenanceWorkspace, { now: '2026-07-26', canMutate: false, plans: [], occurrences: [], assessments: [], runtime: [], gaps: [], weeklyCapacityHours: 40 }));
    expect(ppm).toContain('Risk scores support planning');
    expect(ppm).toContain('review the asset condition before approving a date change');
    expect(ppm).toContain('No runtime-metered assets');
    const inspections = renderToStaticMarkup(createElement(InspectionsWorkspace, { now: '2026-07-26', canMutate: false, obligations: [], inspections: [], workOrderBasePath: '/estate/work-orders' }));
    expect(inspections).toContain('Audit readiness');
    expect(view('inspections/run-drawer')).toContain('`${workOrderBasePath}/${encodeURIComponent(ref)}`');
    for (const file of ['ppm/plan-drawer', 'inspections/run-drawer']) expect(view(file)).toContain('No photo file is uploaded or verified');
    expect(view('ppm/runtime-view')).not.toContain('logRuntimeReading(assetId, 8.4)');
    expect(view('ppm/runtime-view')).toContain('Additional running hours');
  });

  it('preserves original currency and kobo on financial record displays', () => {
    expect(facilityMoney(12345, 'NGN')).toContain('123.45');
    expect(facilityMoney(12345, 'USD')).toContain('123.45');
    const row: ComponentProps<typeof WorkOrdersBoard>['rows'][number] = { id: 'work-1', ref: 'WO-10001', title: 'Repair generator', origin: 'manager', requesterName: 'Ngozi', status: 'assigned', priority: 'routine', assigneeName: 'Emeka', respondDueAt: null, breached: false, cost: { minor: 12345, currency: 'NGN' } };
    const html = renderToStaticMarkup(createElement(WorkOrdersBoard, { rows: [row], canMutate: false, basePath: '/estate/work-orders' }));
    expect(html).toContain('123.45'); expect(html).toContain('/estate/work-orders/WO-10001');
    expect(view('work-orders/work-orders-intel')).toContain('row.cost?.currency === currency');
    expect(read('src/app/(ops)/(facility)/contracts/page.tsx')).toContain('annualValues.set(contract.value.currency');
    expect(read('src/app/(ops)/(facility)/vendors/page.tsx')).toContain('currencies[work.cost.currency]');
  });

  it('makes decorative asset labels and incomplete add/export actions explicit', () => {
    expect(view('assets/assets-explorer')).not.toContain('hashGrid');
    expect(view('assets/assets-explorer')).toContain('A scannable QR code and on-site asset lookup are not connected.');
    expect(view('assets/assets-explorer')).toContain('Asset registration is not connected');
    expect(view('vendors/vendors-explorer')).toContain('Vendor onboarding is not connected');
    expect(view('inspections/inspections-workspace')).toContain('Audit-pack generation is not connected');
    expect(view('work-orders/work-order-detail-view')).not.toContain('confidence={0.88}');
  });

  it('keeps the full field job and provider-labelled copilot experience available', () => {
    const field = renderToStaticMarkup(createElement(TechnicianWorkspace, { jobs: [], techName: 'Emeka Okafor', nowMs }));
    expect(field).toContain('Emeka'); expect(field.match(/role="tabpanel"/g)).toHaveLength(4);
    const copilot = renderToStaticMarkup(createElement(CopilotWorkspace, { world: { systems: [], alarms: [], generators: [], parts: [], contracts: [], permits: [], incidents: [], sensors: [], nowMs }, userName: 'Ngozi Adeyemi', model: 'builtin', usage: { requests: 0, inputTokens: 0, outputTokens: 0, costMinorNgn: 12345 }, canConfigure: false }));
    expect(copilot).toContain('Priority actions remain recorded rules and require their existing human review.');
    expect(copilot).toContain('A connected AI provider is required for conversation.');
    expect(copilot).toContain('123.45'); expect(copilot.match(/role="tabpanel"/g)).toHaveLength(4);
  });
});

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
import { facilityMoney } from '@/components/facility/facility-format';
import type { TenantId } from '@/domain/ids';
import * as facilityActions from '@/server/actions/facility';
import { fireWoTransition } from '@/server/actions/work-orders';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/server/actions/facility', () => ({
  acknowledgeAlarm: vi.fn(), dispatchWoFromAlarm: vi.fn(), logRefuel: vi.fn(), logMeterReading: vi.fn(),
  receiveStock: vi.fn(), advancePermit: vi.fn(), preRegisterVisitor: vi.fn(), checkInVisitor: vi.fn(),
  checkOutVisitor: vi.fn(), setAccessPointMode: vi.fn(), setEstateLockdown: vi.fn(), setSustainabilityTarget: vi.fn(),
}));
vi.mock('@/server/actions/work-orders', () => ({ fireWoTransition: vi.fn() }));

const source = (path: string) => readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
const component = (file: string) => source('src/components/facility/' + file + '.tsx');
const files = ['access-workspace', 'control-center', 'energy-workspace', 'inventory-workspace', 'safety-workspace', 'sustainability-workspace', 'technician-workspace'];
const nowMs = Date.parse('2026-10-23T10:00:00Z');
const tenantId = 'tenant-facility-ui' as TenantId;
const start = '2026-10-23T08:00:00Z';
const end = '2026-10-23T16:00:00Z';
const access: ComponentProps<typeof AccessWorkspace> = {
  points: [{ tenantId, id: 'gate', siteId: 'site', name: 'West vehicle entrance', kind: 'barrier', status: 'online', mode: 'secured', batteryPct: 18, lastEventISO: start }],
  passes: Array.from({ length: 6 }, (_, index) => ({ tenantId, id: 'pass-' + index, code: 'PASS-' + index, siteId: 'site', visitorName: 'Completed visitor ' + index, kind: 'guest' as const, hostName: 'Confirmed host ' + index, hostUnit: 'Block D · 20', purpose: 'Detailed contractor handover and maintenance evidence review without truncation', vehiclePlate: 'ABC 123 XY', status: 'checked_out' as const, validFromISO: start, validToISO: end })),
  events: [{ tenantId, id: 'event', siteId: 'site', pointName: 'West vehicle entrance', atISO: start, kind: 'entry', subjectName: 'Completed visitor 5', credential: 'pass', passCode: 'PASS-5' }],
  kpis: { onSite: 0, expectedToday: 0, online: 1, totalPoints: 1, threats: 0 }, nowMs,
};
const energy: ComponentProps<typeof EnergyWorkspace> = {
  generators: [{ tenantId, id: 'gen', siteId: 'site', siteName: 'Ikoyi facility', name: 'Main 250 kVA generator', capacityKva: 250, status: 'running', fuelPct: 60, tankLitres: 1000, litresPerHour: 10, baselineLph: 9, runtimeHoursToday: 8, runtimeHoursMonth: 120, lastRefuelISO: start }],
  meters: [{ id: 'meter', label: 'West water meter', kind: 'water', unit: 'm³', reading: 1234.5, previous: 1230.25, atISO: start }],
  kpis: { dieselSpendMinor: 12345, litresMonth: 1200, costPerKwhMinor: 123, co2Kg: 3216 }, reliance: { gensetPct: 60, gridPct: 40 }, nowMs,
};
const inventory: ComponentProps<typeof InventoryWorkspace> = {
  parts: [{ tenantId, id: 'part', name: 'Lift emergency intercom assembly', category: 'Vertical transport', sku: 'INT-001', location: 'Store A · Bin C', stock: 2, reorderPoint: 4, usedPerMonth: 3, unitCost: { minor: 12345, currency: 'NGN' } }],
  kpis: { total: 1, belowReorder: 1, stockValueMinor: 24690, stockoutsSoon: 0 },
};
const safety: ComponentProps<typeof SafetyWorkspace> = {
  permits: ['hot_work', 'electrical'].map((type, index) => ({ tenantId, id: 'permit-' + index, ref: 'PTW-' + index, type: type as 'hot_work' | 'electrical', location: 'Plant room', siteId: 'site', requestedBy: 'Responsible supervisor', status: 'requested', validFromISO: start, validToISO: end, note: 'Confirm isolation and complete the toolbox briefing before energising the equipment.' })),
  incidents: [{ tenantId, id: 'incident', siteId: 'site', category: 'Electrical near miss review', severity: 'near_miss', location: 'Plant room', atISO: start, status: 'open' }],
  kpis: { activePermits: 0, openIncidents: 1, safetyScore: 85 },
};
const sustainability: ComponentProps<typeof SustainabilityWorkspace> = {
  esg: { score: 65, band: 'warn', label: 'Needs review' }, kpis: { carbonKg: 3216, gensetPct: 60, waterM3: 1234.5, renewableReadiness: 40 },
  months: [{ label: 'September', co2Kg: 4000, dieselLitres: 1492 }, { label: 'October', co2Kg: 3216, dieselLitres: 1200 }], mix: { gridKwh: 400, gensetKwh: 600 },
  scenarios: [{ id: 'solar', title: 'Rooftop solar feasibility', detail: 'Check roof capacity and supply assumptions before approval.', co2SavedKg: 1234, nairaSavedMinor: 12345, capexMinor: 45699, paybackMonths: null }],
  targets: [{ tenantId, id: 'target', metric: 'carbon', label: 'Reduce generator emissions', unit: 'kg CO₂', baselineValue: 4000, currentValue: 3216, targetValue: 2000, dueISO: '2026-12-31' }],
};

describe('Facility specialist Clinexa composition polish', () => {
  it.each(files)('%s composes real inner headers and semantic status components', (file) => {
    const text = component(file);
    expect(text).toContain("from './facility-specialists.module.css'");
    expect(text).toContain('<CardHeader');
    expect(text).toContain('<StatusPill');
    expect(text).not.toContain('facilityStyles.row');
    expect(text).not.toContain('truncate');
    expect(text).not.toContain('animate-pulse');
  });

  it('contains charts and keeps a fixed ring box within responsive reference spacing', () => {
    const css = source('src/components/facility/facility-specialists.module.css');
    expect(css).toContain('gap: 24px');
    expect(css).toContain('@media (max-width: 640px)');
    expect(css).toContain('gap: 16px');
    expect(css).toContain('minmax(min(100%, 280px), 1fr)');
    expect(css).toContain('.summary > .ring { flex: 0 0 96px; width: 96px; }');
    expect(css).toContain('overflow-x: auto');
    expect(css).toContain('.progress::-webkit-progress-value');
    expect(css).toContain('.progress::-moz-progress-bar');
    expect(css).toContain('font-size: 16px; font-weight: 500');
    expect(css).toContain('font-size: 14px; line-height: 1.7');
  });

  it('shows all visitor history, full destinations and absolute WAT activity without claiming gate control', () => {
    const html = renderToStaticMarkup(createElement(AccessWorkspace, access));
    expect(html).toContain('Completed visitor 5');
    expect(html).toContain('Confirmed host 5');
    expect(html).toContain('Detailed contractor handover and maintenance evidence review without truncation');
    expect(html).toContain('Showing all 6 scoped pass record(s)');
    expect(html).toContain('aria-label="Visitor pass register" tabindex="0"');
    expect(html).toContain('aria-label="Recorded gate activity register" tabindex="0"');
    expect(html).toContain('not a connected gate controller');
    expect(html).not.toContain('Record unlocked mode</button>');
    expect(html).not.toContain('Check in</button>');
  });

  it('uses readable textual system state and contained sensor cards', () => {
    const html = renderToStaticMarkup(createElement(ControlCenter, { health: { score: 88, band: 'success', label: 'Healthy' }, systems: [{ id: 'sys', name: 'Domestic water pumps', category: 'water', status: 'degraded', detail: 'Inspect the standby pump and confirm the pressure reading.', siteName: 'Ikoyi facility' }], sensors: [{ id: 'sensor', name: 'Tank', kind: 'water_tank', value: 57, unit: '%', low: 30, high: 90, siteName: 'Ikoyi facility' }], alarms: [], kpis: { operational: 0, total: 1, powerSource: 'Grid', waterPct: 57 }, nowMs }));
    expect(html).toContain('degraded');
    expect(html).toContain('Inspect the standby pump and confirm the pressure reading.');
    expect(html).toMatch(/<div(?=[^>]*role="region")(?=[^>]*tabindex="0")(?=[^>]*aria-label="Building systems register")[^>]*>/);
    expect(html).toContain('57%');
    expect(html).toContain('Low: 30%');
    expect(html).not.toContain('Create work order</button>');
  });

  it('retains fuel planning, precise meter deltas and exact kobo rather than compact financial shorthand', () => {
    const html = renderToStaticMarkup(createElement(EnergyWorkspace, energy));
    expect(html).toContain('Main 250 kVA generator');
    expect(html).toContain('Estimated fuel runway');
    expect(html).toContain('Runtime this month');
    expect(html).toContain('120 hours');
    expect(html).toContain('4.25 m³');
    expect(html).toContain(facilityMoney(12345));
    expect(html).toMatch(/<div(?=[^>]*role="region")(?=[^>]*tabindex="0")(?=[^>]*aria-label="Energy meter register")[^>]*>/);
    expect(html).not.toContain('Log refuel</button>');
    expect(html).not.toContain('Log reading</button>');
  });

  it('keeps labelled filters inside an accessible stock register and receiving gated', () => {
    const html = renderToStaticMarkup(createElement(InventoryWorkspace, inventory));
    expect(html).toContain('aria-label="Search parts"');
    expect(html).toContain('Part category');
    expect(html).toMatch(/<div(?=[^>]*role="region")(?=[^>]*tabindex="0")(?=[^>]*aria-label="Spare parts inventory register")[^>]*>/);
    expect(html).toContain('Store A · Bin C');
    expect(html).toContain('Reorder review');
    expect(html).toContain(facilityMoney(24690));
    expect(html).not.toContain('Receive</button>');
  });

  it('preserves permit work notes and conflicts rather than compressing them into metadata', () => {
    const html = renderToStaticMarkup(createElement(SafetyWorkspace, safety));
    expect(html).toContain('Permit clash detected');
    expect(html).toContain('Confirm isolation and complete the toolbox briefing before energising the equipment.');
    expect(html).toContain('Responsible supervisor');
    expect(html).toContain('aria-label="Facility permit register" tabindex="0"');
    expect(html).toContain('aria-label="Facility incident register" tabindex="0"');
    expect(html).toContain('near miss');
    expect(html).not.toContain('Approve &amp; activate</button>');
    expect(component('safety-workspace')).toContain('Confirm work is complete and the work area has been made safe');
  });

  it('retains chart source measurements, full scenario assumptions and exact local currency', () => {
    const html = renderToStaticMarkup(createElement(SustainabilityWorkspace, sustainability));
    expect(html).toContain('1492 litres diesel');
    expect(html).toContain('Rooftop solar feasibility');
    expect(html).toContain('Check roof capacity and supply assumptions before approval.');
    expect(html).toContain(facilityMoney(12345));
    expect(html).toContain(facilityMoney(45699));
    expect(html).toContain('Not calculated');
    expect(html).toContain('Reduce generator emissions');
    expect(html).toContain('2026-12-31');
    expect(html).toContain('not an independently verified ESG rating');
    expect(html).not.toContain('Adjust target</button>');
  });

  it('does not invent an energy mix when there are no readings', () => {
    const html = renderToStaticMarkup(createElement(SustainabilityWorkspace, { ...sustainability, months: [], mix: { gridKwh: 0, gensetKwh: 0 }, scenarios: [], targets: [] }));
    expect(html).toContain('Insufficient baseline');
    expect(html).toContain('No energy mix recorded');
    expect(html).toContain('No reduction scenarios');
    expect(html).toContain('No targets recorded');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });

  it('keeps completed job detail readable and avoids claiming that historic records happened today', () => {
    const html = renderToStaticMarkup(createElement(TechnicianWorkspace, { techName: 'Ade Balogun', nowMs, jobs: [{ ref: 'WO-1', title: 'Replace the complete passenger lift emergency intercom assembly', priority: 'high', status: 'closed', origin: 'manager', dueISO: start, location: 'Block D · Passenger lift', assetName: 'Lift controller A' }, { ref: 'WO-2', title: 'Inspect pump isolation', priority: 'routine', status: 'assigned', origin: 'ppm_schedule', dueISO: end, location: 'Plant room' }] }));
    expect(html).toContain('Replace the complete passenger lift emergency intercom assembly');
    expect(html).toContain('Lift controller A');
    expect(html).toContain('Block D · Passenger lift');
    expect(html).toContain('closed');
    expect(html).toContain('not limited to today');
    expect(html).not.toContain('Done today');
    expect(html).not.toContain('line-through');
    expect(html).not.toContain('Start job</button>');
    expect(component('technician-workspace')).toContain('Confirm job resolution');
  });

  it('keeps every newly polished form native, labelled, pending protected and duplicate protected', () => {
    for (const file of ['access-workspace', 'energy-workspace', 'inventory-workspace', 'sustainability-workspace']) {
      const text = component(file);
      expect(text).toContain('<form');
      expect(text).toContain('<label');
      expect(text).toContain('pending={pending}');
      expect(text).toContain('inFlight.current');
      expect(text).toContain('role="alert"');
    }
    for (const file of ['control-center', 'safety-workspace', 'technician-workspace']) {
      expect(component(file)).toContain('<FacilityDialog');
      expect(component(file)).toContain('inFlight.current');
    }
  });

  it('performs no operational writes merely by rendering every specialist screen', () => {
    for (const action of Object.values(facilityActions)) expect(action).not.toHaveBeenCalled();
    expect(fireWoTransition).not.toHaveBeenCalled();
  });
});

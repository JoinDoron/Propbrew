import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ControlCenter } from '@/components/facility/control-center';
import { AccessWorkspace } from '@/components/facility/access-workspace';
import { EnergyWorkspace } from '@/components/facility/energy-workspace';
import { InventoryWorkspace } from '@/components/facility/inventory-workspace';
import { SafetyWorkspace } from '@/components/facility/safety-workspace';
import { SustainabilityWorkspace } from '@/components/facility/sustainability-workspace';
import { TechnicianWorkspace } from '@/components/facility/technician-workspace';
import { CopilotWorkspace } from '@/components/facility/copilot-workspace';
import { AssetsExplorer } from '@/components/assets/assets-explorer';
import { VendorsExplorer } from '@/components/vendors/vendors-explorer';
import { SpacesExplorer } from '@/components/spaces/spaces-explorer';
import { MaintenanceWorkspace } from '@/components/ppm/maintenance-workspace';
import { InspectionsWorkspace } from '@/components/inspections/inspections-workspace';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement('a', { ...props, href }, children) }));
vi.mock('@/server/actions/facility', () => ({}));
vi.mock('@/server/actions/ppm', () => ({}));
vi.mock('@/server/actions/inspections', () => ({}));
vi.mock('@/server/actions/work-orders', () => ({}));

const nowMs = Date.parse('2026-07-26T09:00:00Z');
const screens: { name: string; tree: ReactElement; tabs: string[]; initial: string }[] = [
  { name: 'Facility overview and control center', tree: createElement(ControlCenter, { health: { score: 100, band: 'success', label: 'Healthy' }, systems: [], sensors: [], alarms: [], kpis: { operational: 0, total: 0, powerSource: 'Grid', waterPct: 80 }, nowMs }), tabs: ['Overview', 'Sensor readings', 'Building systems', 'Alarms'], initial: 'Overview' },
  { name: 'Access', tree: createElement(AccessWorkspace, { points: [], passes: [], events: [], kpis: { onSite: 0, expectedToday: 0, online: 0, totalPoints: 0, threats: 0 }, nowMs }), tabs: ['Access overview', 'Access points', 'Visitor passes', 'Gate activity'], initial: 'Visitor passes' },
  { name: 'Energy', tree: createElement(EnergyWorkspace, { generators: [], meters: [], kpis: { dieselSpendMinor: 0, litresMonth: 0, costPerKwhMinor: 0, co2Kg: 0 }, reliance: { gridPct: 100, gensetPct: 0 }, nowMs }), tabs: ['Energy overview', 'Generators &amp; fuel', 'Meter readings'], initial: 'Energy overview' },
  { name: 'Inventory', tree: createElement(InventoryWorkspace, { parts: [], kpis: { total: 0, belowReorder: 0, stockValueMinor: 0, stockoutsSoon: 0 } }), tabs: ['Stock overview', 'Parts &amp; receiving'], initial: 'Parts &amp; receiving' },
  { name: 'Safety', tree: createElement(SafetyWorkspace, { permits: [], incidents: [], kpis: { activePermits: 0, openIncidents: 0, safetyScore: 100 } }), tabs: ['Permits to work', 'Incident log'], initial: 'Permits to work' },
  { name: 'Sustainability', tree: createElement(SustainabilityWorkspace, { esg: { score: 100, band: 'success', label: 'Healthy' }, kpis: { carbonKg: 0, gensetPct: 0, waterM3: 0, renewableReadiness: 100 }, months: [], mix: { gridKwh: 0, gensetKwh: 0 }, scenarios: [], targets: [] }), tabs: ['ESG performance', 'Reduction pathways', 'Targets'], initial: 'ESG performance' },
  { name: 'My Day', tree: createElement(TechnicianWorkspace, { jobs: [], techName: 'Ade', nowMs }), tabs: ['On now', 'Up next', 'On hold', 'Completed'], initial: 'Up next' },
  { name: 'Facility AI', tree: createElement(CopilotWorkspace, { world: { systems: [], alarms: [], generators: [], parts: [], contracts: [], permits: [], incidents: [], sensors: [], nowMs }, userName: 'Ade', model: 'builtin', usage: { requests: 0, inputTokens: 0, outputTokens: 0, costMinorNgn: 0 }, canConfigure: false }), tabs: ['Ask Copilot', 'Priority actions', 'Usage &amp; cost', 'Safeguards'], initial: 'Ask Copilot' },
  { name: 'Assets', tree: createElement(AssetsExplorer, { assets: [], ppm: [], jobs: [], health: {}, canMutate: false }), tabs: ['Portfolio health', 'Assets &amp; service history'], initial: 'Assets &amp; service history' },
  { name: 'Vendors', tree: createElement(VendorsExplorer, { vendors: [], jobs: [], spend: {}, canMutate: false }), tabs: ['AI vendor matching', 'Directory &amp; compliance'], initial: 'Directory &amp; compliance' },
  { name: 'Spaces', tree: createElement(SpacesExplorer, { sites: [], buildings: [], units: [] }), tabs: ['Occupancy &amp; modelled revenue', 'Unit register'], initial: 'Unit register' },
  { name: 'Maintenance', tree: createElement(MaintenanceWorkspace, { now: '2026-07-26', canMutate: false, occurrences: [], plans: [], assessments: [], runtime: [], gaps: [], weeklyCapacityHours: 40 }), tabs: ['Calendar', 'Runtime', 'AI risk', 'Plan register'], initial: 'Calendar' },
  { name: 'Inspections', tree: createElement(InspectionsWorkspace, { now: '2026-07-26', canMutate: false, obligations: [], inspections: [] }), tabs: ['Compliance register', 'Inspections (0)'], initial: 'Compliance register' },
];

describe('Facility page-local sections', () => {
  it.each(screens)('$name provides meaningful, mounted tab panels and a usable default', ({ tree, tabs, initial }) => {
    const html = renderToStaticMarkup(tree);
    expect(html.match(/role="tablist"/g)).toHaveLength(1);
    expect(html.match(/role="tab"/g)).toHaveLength(tabs.length);
    expect(html.match(/role="tabpanel"/g)).toHaveLength(tabs.length);
    expect(html.match(/hidden=""/g)).toHaveLength(tabs.length - 1);
    for (const tab of tabs) expect(html).toContain(tab);
    const selected = html.match(/role="tab"[^>]*aria-selected="true"[^>]*>(.*?)<\/button>/)?.[1];
    expect(selected).toContain(initial);
  });

  it('keeps emergency lockdown available outside every hidden access panel', () => {
    const html = renderToStaticMarkup(screens[1].tree);
    expect(html.indexOf('Lock down estate')).toBeLessThan(html.indexOf('role="tablist"'));
  });

  it('keeps live health and alarm counts visible when another facility section is selected', () => {
    const html = renderToStaticMarkup(screens[0].tree);
    expect(html.indexOf('systems healthy')).toBeLessThan(html.indexOf('role="tablist"'));
  });
});

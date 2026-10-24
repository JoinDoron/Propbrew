import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';
import { AnnouncementsWorkspace } from '@/components/announcements/announcements-workspace';
import { GovernanceWorkspace } from '@/components/estate/governance-workspace';
import { TenancyWorkspace } from '@/components/estate/tenancy-workspace';
import { CollectionsWorkspace } from '@/components/estate/collections-workspace';
import { ResidentsExplorer, type ResidentRow } from '@/components/people/residents-explorer';
import { EstatePropertiesWorkspace } from '@/components/workspaces/estate-properties-workspace';
import type { EstatePropertySummary } from '@/domain/estate/properties';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: { href: string; children?: ReactNode }) => createElement('a', { ...props, href }, children) }));
vi.mock('@/server/actions/announcements', () => ({}));
vi.mock('@/server/actions/estate', () => ({}));

const read = (path: string) => readFileSync(new URL(`../../src/${path}`, import.meta.url), 'utf8');
const routes = [
  ['announcements', 'announcements', 'AnnouncementsWorkspace', 'components/announcements/announcements-workspace.tsx'],
  ['billing', 'charges_invoicing', 'BillingWorkspace', 'components/billing/billing-workspace.tsx'],
  ['board', 'announcements', 'BoardWorkspace', 'components/estate/board-workspace.tsx'],
  ['bookings', 'bookings_amenities', 'BookingsWorkspace', 'components/bookings/bookings-workspace.tsx'],
  ['collections', 'charges_invoicing', 'CollectionsWorkspace', 'components/estate/collections-workspace.tsx'],
  ['community', 'announcements', 'CommunityPulse', 'components/estate/community-pulse.tsx'],
  ['documents', 'announcements', 'DocumentsWorkspace', 'components/documents/documents-workspace.tsx'],
  ['estate', null, 'EstateHome', 'components/workspaces/estate-home.tsx'],
  ['events', 'bookings_amenities', 'EventsWorkspace', 'components/estate/events-workspace.tsx'],
  ['governance', 'announcements', 'GovernanceWorkspace', 'components/estate/governance-workspace.tsx'],
  ['investors', 'investor_projects', 'InvestorWorkspace', 'components/investors/investor-workspace.tsx'],
  ['marketplace', 'marketplace', 'MarketplaceWorkspace', 'components/marketplace/marketplace-workspace.tsx'],
  ['parcels', 'security_sos', 'ParcelsWorkspace', 'components/estate/parcels-workspace.tsx'],
  ['people', 'users_roles', 'ResidentsExplorer', 'components/people/residents-explorer.tsx'],
  ['portfolio', 'reports_analytics', 'PortfolioWorkspace', 'components/facility/portfolio-workspace.tsx'],
  ['properties', 'assets_ppm', 'EstatePropertiesWorkspace', 'components/workspaces/estate-properties-workspace.tsx'],
  ['reports', 'reports_analytics', 'PageTabs', null],
  ['rewards', 'announcements', 'RewardsWorkspace', 'components/estate/rewards-workspace.tsx'],
  ['security', 'security_sos', 'SosConsole', 'components/security/sos-console.tsx'],
  ['settings', 'tenant_config', 'PageTabs', null],
  ['tenancy', 'users_roles', 'TenancyWorkspace', 'components/estate/tenancy-workspace.tsx'],
] as const;

describe('Estate page section wiring', () => {
  it('covers every Estate route rather than silently omitting a page', () => {
    const path = new URL('../../src/app/(ops)/(estate)/', import.meta.url);
    const actual = readdirSync(path, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name).sort();
    expect(routes.map(([route]) => route).sort()).toEqual(actual);
    expect(actual).toHaveLength(21);
  });

  it.each(routes)('/%s preserves its permission boundary and renders the tabbed workspace', (route, capability, component, workspace) => {
    const page = read(`app/(ops)/(estate)/${route}/page.tsx`);
    expect(page).toContain(`<${component}`);
    if (capability) {
      expect(page).toContain(`await requireCapability('${capability}', 'read', 'estate')`);
      const firstRead = page.indexOf('repos.');
      if (firstRead !== -1) expect(page.indexOf('await requireCapability(')).toBeLessThan(firstRead);
    } else {
      // Estate home is a mixed-capability dashboard, not a single-feature page.
      expect(page).toContain("await requireWorkspace('estate')");
      const home = read(workspace!);
      expect(home).toContain('await requireOperatorSession()');
      expect(home).toContain("can(actor, 'charges_invoicing', 'read').allowed");
      expect(home).toContain('access.billing ? allRows');
    }
    const implementation = workspace ? read(workspace) : page;
    expect(implementation).toContain("from '@/components/ui/page-tabs'");
    expect(implementation).toContain('<PageTabs');
  });
});

const nowMs = Date.parse('2026-07-26T09:00:00Z');
const emptyScreens: { name: string; tree: ReactElement; message: string }[] = [
  { name: 'Announcements', tree: createElement(AnnouncementsWorkspace, { rows: [], canMutate: true }), message: 'No announcements in your scope yet' },
  { name: 'Motions', tree: createElement(GovernanceWorkspace, { motions: [], nowMs }), message: 'No motions in your scope yet' },
  { name: 'Tenancies', tree: createElement(TenancyWorkspace, { tenancies: [], kpis: { active: 0, inMotion: 0, renewalsSoon: 0, depositExposureMinor: 0 }, nowMs, canMutate: false }), message: 'No tenancy records in your scope yet.' },
  { name: 'Collection cases', tree: createElement(CollectionsWorkspace, { cases: [], forecast: { outstandingMinor: 0, expectedMinor: 0, recoveryPct: 0 }, canMutate: false }), message: 'No collection cases in your scope.' },
];

describe('Estate empty sections', () => {
  it.each(emptyScreens)('$name supplies explicit empty guidance inside its panel', ({ tree, message }) => {
    const html = renderToStaticMarkup(tree);
    expect(html).toContain('role="tablist"');
    expect(html).toContain(message);
    expect(html.indexOf(message)).toBeGreaterThan(html.indexOf('role="tabpanel"'));
  });

  it('does not suggest Compose to a read-only viewer', () => {
    const html = renderToStaticMarkup(createElement(AnnouncementsWorkspace, { rows: [], canMutate: false }));
    expect(html).toContain('Published notices will appear here when available.');
    expect(html).not.toContain('Use Compose');
  });
});

const resident: ResidentRow = {
  id: 'resident-a', userId: 'user-a', name: 'Ada Okafor', unitId: 'unit-a',
  unitLabel: 'A01', unitType: 'Apartment', status: 'active', household: 1,
  balanceLabel: '—', balanceOwed: false, moveInDate: '2026-01-01',
};
const permissions = Array.from({ length: 8 }, (_, flags) => ({
  seesBills: Boolean(flags & 1), seesRequests: Boolean(flags & 2), seesBookings: Boolean(flags & 4),
}));
function residentView(access: typeof permissions[number], residents = [resident]) {
  return renderToStaticMarkup(createElement(ResidentsExplorer, {
    residents, ...access, canMutate: false,
    bills: [{ id: 'bill-a', ref: 'PRIVATE_BILL_REFERENCE', ownerUserId: 'user-a', unitId: 'unit-a', status: 'overdue', amountLabel: 'PRIVATE_BILL_AMOUNT', dueDate: '2026-07-01' }],
    requests: [{ id: 'request-a', ref: 'PRIVATE_REQUEST_REFERENCE', requesterUserId: 'user-a', unitId: 'unit-a', title: 'PRIVATE_REQUEST_TITLE', status: 'new' }],
    bookings: [{ id: 'booking-a', ownerUserId: 'user-a', amenity: 'PRIVATE_BOOKING_AMENITY', status: 'requested', slot: '2026-07-27T10:00:00Z' }],
  }));
}

describe('Resident capability-aware section tabs', () => {
  it.each(permissions)('only renders authorised related panels: %j', (access) => {
    const html = residentView(access);
    const tabs = [...html.matchAll(/role="tab"[^>]*>(.*?)<\/button>/g)].map((match) => match[1].replace(/<[^>]+>/g, ''));
    expect(tabs.some((label) => label.startsWith('Bills'))).toBe(access.seesBills);
    expect(tabs.some((label) => label.startsWith('Maintenance'))).toBe(access.seesRequests);
    expect(tabs.some((label) => label.startsWith('Bookings'))).toBe(access.seesBookings);
    for (const [allowed, secret] of [
      [access.seesBills, 'PRIVATE_BILL_REFERENCE'], [access.seesBills, 'PRIVATE_BILL_AMOUNT'],
      [access.seesRequests, 'PRIVATE_REQUEST_REFERENCE'], [access.seesRequests, 'PRIVATE_REQUEST_TITLE'],
      [access.seesBookings, 'PRIVATE_BOOKING_AMENITY'],
    ] as const) expect(html.includes(secret)).toBe(allowed);
    expect(tabs).toContain('Profile &amp; household');
    expect(tabs).toContain('Communication');
    expect(html).not.toContain('>Invite</button>');
  });

  it('shows a useful directory-only empty state when no resident can be selected', () => {
    const html = residentView({ seesBills: true, seesRequests: true, seesBookings: true }, []);
    expect(html.match(/role="tab"/g)).toHaveLength(1);
    expect(html).toContain('No residents match.');
    expect(html).not.toContain('PRIVATE_');
  });
});

const property: EstatePropertySummary = {
  id: 'property-a', name: 'Lagos Gardens', address: 'Lekki, Lagos', unitTypes: ['Apartment'],
  unitCount: 1, occupiedUnits: 0, vacantUnits: 1, reservedUnits: 0, unavailableUnits: 0, occupancyPct: 0,
  units: [{ id: 'unit-a', label: 'A01', type: 'Apartment', occupancy: 'vacant' }],
};

describe('Property register sections preserve existing tools', () => {
  it('retains list/grid controls, filters and a labelled native details dialog', () => {
    const html = renderToStaticMarkup(createElement(EstatePropertiesWorkspace, { properties: [property], actions: createElement('button', null, 'ADD_PROPERTY_ACTION') }));
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain('aria-label="List view" aria-pressed="true"');
    expect(html).toContain('aria-label="Grid view" aria-pressed="false"');
    for (const label of ['Search properties', 'Unit type', 'Availability', 'Sort by', 'Lagos Gardens']) expect(html).toContain(label);
    expect(html).toContain('<dialog');
    expect(html).toContain('aria-labelledby="property-detail-heading"');
    expect(html.indexOf('ADD_PROPERTY_ACTION')).toBeLessThan(html.indexOf('role="tablist"'));
  });

  it('keeps the native dialog outside every page-panel slot', () => {
    const source = read('components/workspaces/estate-properties-workspace.tsx');
    const file = ts.createSourceFile('estate-properties-workspace.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const tabNodes: ts.JsxSelfClosingElement[] = [];
    const dialogNodes: ts.JsxElement[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(file) === 'PageTabs') tabNodes.push(node);
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'dialog') dialogNodes.push(node);
      ts.forEachChild(node, visit);
    };
    visit(file);
    expect(tabNodes).toHaveLength(1);
    expect(dialogNodes).toHaveLength(1);
    expect(dialogNodes[0].getStart(file)).toBeGreaterThan(tabNodes[0].end);
  });
});

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { assertCan, type Action, type Actor, type Capability } from '@/lib/authz';
import { canEnterWorkspace } from '@/config/workspaces';
import { identityByKey } from '@/server/identities';
import type { ComplianceObligation, Inspection } from '@/domain/entities';
import type { InspectionsData } from '@/components/inspections/types';

const boundary = vi.hoisted(() => ({
  guard: vi.fn(), workspace: vi.fn<(props: InspectionsData) => null>(() => null),
}));
vi.mock('@/server/guard', () => ({ requireCapability: boundary.guard }));
vi.mock('@/components/inspections/inspections-workspace', () => ({ InspectionsWorkspace: boundary.workspace }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/inspections', () => ({ runInspection: vi.fn() }));

import EstateInspectionsPage from '@/app/(ops)/(estate)/estate/inspections/page';
import { RunInspectionDrawer } from '@/components/inspections/run-drawer';
import { repos } from '@/server/data';
import { db } from '@/server/data/store';

const original = { inspections: [...db.inspections], obligations: [...db.complianceObligations] };
const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

function actAs(key: string, overrides: Partial<Actor> = {}) {
  const actor = { ...identityByKey(key).actor, ...overrides };
  boundary.guard.mockImplementation(async (capability: Capability, action: Action, workspace: string) => {
    if (workspace !== 'estate' || !canEnterWorkspace(actor, 'estate')) throw new Error('Workspace denied');
    return { actor, scope: assertCan(actor, capability, action) };
  });
  return actor;
}

function inspection(overrides: Partial<Inspection> = {}): Inspection {
  return { ...original.inspections[0], id: 'estate-inspection', ref: 'INS-ESTATE', ...overrides };
}

function obligation(overrides: Partial<ComplianceObligation> = {}): ComplianceObligation {
  return { ...original.obligations[0], id: 'estate-obligation', ...overrides };
}

async function renderPage() {
  const html = renderToStaticMarkup(await EstateInspectionsPage());
  const data = boundary.workspace.mock.calls[0][0];
  return { html, data };
}

beforeEach(() => {
  vi.clearAllMocks();
  actAs('estate_manager');
});

afterEach(() => {
  db.inspections.splice(0, db.inspections.length, ...original.inspections);
  db.complianceObligations.splice(0, db.complianceObligations.length, ...original.obligations);
  vi.restoreAllMocks();
});

describe('Estate-owned inspections page', () => {
  it('uses the Estate guard and passes an Estate work-order destination', async () => {
    const { html, data } = await renderPage();
    expect(boundary.guard).toHaveBeenCalledWith('inspections_compliance', 'read', 'estate');
    expect(data.workOrderBasePath).toBe('/estate/work-orders');
    expect(html).toContain('Estate inspections &amp; compliance');
    expect(html).toContain('without leaving Estate');
  });

  it.each([
    ['estate_manager', false], ['executive', false], ['facility_manager', true],
  ] as const)('retains the %s inspection mutation grant', async (key, expected) => {
    actAs(key);
    expect((await renderPage()).data.canMutate).toBe(expected);
  });

  it('excludes Facility and foreign-tenant records even for a tenant-wide executive', async () => {
    actAs('executive');
    db.inspections.push(inspection({ id: 'facility-inspection', template: 'FACILITY_SECRET', siteId: 's-victoria' as Inspection['siteId'], estateId: 's-victoria' as Inspection['estateId'] }));
    db.complianceObligations.push(obligation({ id: 'facility-obligation', name: 'FACILITY_SECRET', siteId: 's-victoria' as ComplianceObligation['siteId'], estateId: 's-victoria' as ComplianceObligation['estateId'] }));
    db.inspections.push(inspection({ id: 'foreign-inspection', template: 'FOREIGN_SECRET', tenantId: 'foreign-tenant' as Inspection['tenantId'] }));
    db.complianceObligations.push(obligation({ id: 'foreign-obligation', name: 'FOREIGN_SECRET', tenantId: 'foreign-tenant' as ComplianceObligation['tenantId'] }));
    const { data } = await renderPage();
    const payload = JSON.stringify(data);
    expect(data.inspections.length).toBeGreaterThan(0);
    expect(payload).not.toContain('FACILITY_SECRET');
    expect(payload).not.toContain('FOREIGN_SECRET');
    expect(data.inspections.every((row) => row.siteId === 's-gardens' && row.tenantId === 't-lekki')).toBe(true);
  });

  it('does not attach an inspection whose mirrored estate belongs to a different module', async () => {
    actAs('executive');
    db.inspections.push(inspection({ id: 'mismatched-inspection', estateId: 's-victoria' as Inspection['estateId'] }));
    db.complianceObligations.push(obligation({ id: 'mismatched-obligation', estateId: 's-victoria' as ComplianceObligation['estateId'] }));
    const { data } = await renderPage();
    expect(data.inspections.some((row) => row.id === 'mismatched-inspection')).toBe(false);
    expect(data.obligations.some((row) => row.id === 'mismatched-obligation')).toBe(false);
  });

  it('shows no Estate records to an actor scoped only to a Facility property', async () => {
    actAs('facility_manager', { estateIds: ['s-victoria'] });
    const { data } = await renderPage();
    expect(data.inspections).toEqual([]);
    expect(data.obligations).toEqual([]);
  });

  it('loads all authorised pages rather than truncating the compliance register', async () => {
    db.inspections.splice(0, db.inspections.length, ...Array.from({ length: 205 }, (_, index) => inspection({ id: `page-inspection-${index}` })));
    db.complianceObligations.splice(0, db.complianceObligations.length, ...Array.from({ length: 205 }, (_, index) => obligation({ id: `page-obligation-${index}` })));
    const inspections = vi.spyOn(repos.inspections, 'list');
    const obligations = vi.spyOn(repos.complianceObligations, 'list');
    const { data } = await renderPage();
    expect(data.inspections).toHaveLength(205);
    expect(data.obligations).toHaveLength(205);
    expect(inspections.mock.calls[1][1]).toEqual({ cursor: '200', limit: 200 });
    expect(obligations.mock.calls[1][1]).toEqual({ cursor: '200', limit: 200 });
  });

  it('denies a role without inspection access before reading or serialising records', async () => {
    actAs('security');
    const inspections = vi.spyOn(repos.inspections, 'list');
    const obligations = vi.spyOn(repos.complianceObligations, 'list');
    await expect(EstateInspectionsPage()).rejects.toThrow();
    expect(inspections).not.toHaveBeenCalled();
    expect(obligations).not.toHaveBeenCalled();
    expect(boundary.workspace).not.toHaveBeenCalled();
  });
});

describe('inspection follow-up stays in its originating portal', () => {
  const failed = original.inspections.find((row) => row.status === 'failed')!;

  it.each([
    [undefined, '/work-orders/WO-24817'],
    ['/estate/work-orders' as const, '/estate/work-orders/WO-24817'],
  ])('uses the correct raised work-order destination with base %s', (workOrderBasePath, expected) => {
    const html = renderToStaticMarkup(createElement(RunInspectionDrawer, {
      inspection: failed, canMutate: false, workOrderBasePath, onClose: () => undefined,
    }));
    expect(html).toContain(`href="${expected}"`);
  });

  it('encodes a reference as one route segment', () => {
    const html = renderToStaticMarkup(createElement(RunInspectionDrawer, {
      inspection: { ...failed, raisedWorkOrderRefs: ['WO/with space'] }, canMutate: false,
      workOrderBasePath: '/estate/work-orders', onClose: () => undefined,
    }));
    expect(html).toContain('href="/estate/work-orders/WO%2Fwith%20space"');
  });

  it('passes portal context through the existing inspection workspace without changing actions', () => {
    const workspace = read('src/components/inspections/inspections-workspace.tsx');
    expect(workspace).toContain('workOrderBasePath={data.workOrderBasePath}');
    const drawer = read('src/components/inspections/run-drawer.tsx');
    expect(drawer).toContain("workOrderBasePath = '/work-orders'");
    expect(drawer).toContain('await runInspection(inspection.id,');
    expect(read('src/app/(ops)/(facility)/inspections/page.tsx')).toContain("requireCapability('inspections_compliance', 'read', 'facility')");
  });

  it('keeps both document compliance handoffs within Estate', () => {
    for (const file of ['documents-workspace.tsx', 'doc-drawer.tsx']) {
      const source = read(`src/components/documents/${file}`);
      expect(source).toContain('href="/estate/inspections"');
      expect(source).not.toContain('href="/inspections"');
    }
  });
});

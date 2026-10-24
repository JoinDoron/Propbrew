import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { Actor } from '@/lib/authz';
import { canEnterWorkspace, type WorkspaceId } from '@/config/workspaces';
import { identityByKey, type DevIdentity } from '@/server/identities';
import type { EstatePropertySummary } from '@/domain/estate/properties';
import type { Site, Unit } from '@/domain/entities';
import { asId } from '@/domain/ids';

const boundary = vi.hoisted(() => ({
  getActor: vi.fn(), devIdentityEnabled: vi.fn(), requireOperatorSession: vi.fn(), requireWorkspace: vi.fn(), notFound: vi.fn(),
}));
vi.mock('@/server/session', () => ({ getActor: boundary.getActor, devIdentityEnabled: boundary.devIdentityEnabled }));
vi.mock('@/server/workspaces', () => ({ requireOperatorSession: boundary.requireOperatorSession, requireWorkspace: boundary.requireWorkspace }));
vi.mock('next/navigation', () => ({ notFound: boundary.notFound }));
vi.mock('@/components/workspaces/estate-properties-workspace', () => ({ EstatePropertiesWorkspace: () => null }));
vi.mock('@/components/workspaces/estate-create-actions', () => ({ EstateCreateActions: () => null }));

import EstatePropertiesPage, { dynamic } from '@/app/(ops)/(estate)/properties/page';
import { repos } from '@/server/data';
import { db } from '@/server/data/store';

const originalSites = [...db.sites];
const originalUnits = [...db.units];
type WorkspaceProps = { properties: EstatePropertySummary[]; demo: boolean; actions: ReactElement<{ canAddProperty: boolean; canAddTenant: boolean; units: unknown[]; demo: boolean; asOfDate: string }> };

function actAs(key: string, overrides: Partial<Actor> = {}, sessionKey?: string) {
  const base = identityByKey(key);
  const session = { ...base, key: sessionKey ?? base.key, actor: { ...base.actor, ...overrides } };
  boundary.requireOperatorSession.mockResolvedValue(session);
  boundary.getActor.mockResolvedValue(session.actor);
  return session;
}

async function view(): Promise<WorkspaceProps> {
  const tree = await EstatePropertiesPage();
  return tree.props as WorkspaceProps;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DATA_SOURCE', 'memory');
  vi.stubEnv('PROPBREW_REVIEW_MODE', '0');
  boundary.devIdentityEnabled.mockReturnValue(true);
  boundary.notFound.mockImplementation((): never => { throw new Error('not-found'); });
  boundary.requireWorkspace.mockImplementation(async (workspace: WorkspaceId) => {
    const session: DevIdentity = await boundary.requireOperatorSession();
    if (!canEnterWorkspace(session.actor, workspace)) boundary.notFound();
    return session;
  });
  actAs('estate_manager');
});

afterEach(() => {
  vi.unstubAllEnvs();
  db.sites.splice(0, db.sites.length, ...originalSites);
  db.units.splice(0, db.units.length, ...originalUnits);
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('Estate Properties server boundary', () => {
  it('is force-dynamic and scopes the assigned estate without foreign/facility properties', async () => {
    const result = await view();
    expect(dynamic).toBe('force-dynamic');
    expect(boundary.requireWorkspace).toHaveBeenCalledWith('estate');
    expect(result.properties.map((property) => property.name)).toEqual(['Lekki Gardens Estate']);
    expect(result.properties[0]).toMatchObject({ id: 's-gardens', unitCount: 10 });
    expect(JSON.stringify(result.properties)).not.toMatch(/Victoria Court|Ikoyi|t-ikoyi|s-ikoyi|tenantId/);
  });

  it('shows estate-only properties to an executive even though Facility sites are also scoped', async () => {
    actAs('executive');
    const result = await view();
    expect(result.properties.map((property) => property.id)).toEqual(['s-gardens']);
    expect(result.actions.props.canAddProperty).toBe(false);
    expect(result.actions.props.canAddTenant).toBe(false);
  });

  it('makes no resident, financial, operational or AI repository reads', async () => {
    const hidden = [vi.spyOn(repos.residents, 'list'), vi.spyOn(repos.invoices, 'list'), vi.spyOn(repos.workOrders, 'list'), vi.spyOn(repos.sosEvents, 'list'), vi.spyOn(repos.bookings, 'list'), vi.spyOn(repos.announcements, 'list')];
    for (const spy of hidden) spy.mockImplementation(() => { throw new Error('Properties must not access this private dataset'); });
    const result = await view();
    for (const spy of hidden) expect(spy).not.toHaveBeenCalled();
    expect(JSON.stringify(result.properties)).not.toMatch(/residentName|ownerUserId|email|phone|balance|amount|paid|invoice|sos/);
    expect(result.actions.props.units).toEqual([]);
  });

  it.each(['security', 'resident', 'vendor', 'investor', 'technician', 'platform_admin'])('denies %s before any property or unit read', async (key) => {
    actAs(key);
    const sites = vi.spyOn(repos.sites, 'list');
    const units = vi.spyOn(repos.units, 'list');
    await expect(view()).rejects.toThrow('not-found');
    expect(sites).not.toHaveBeenCalled();
    expect(units).not.toHaveBeenCalled();
  });

  it.each([null, '', '   '])('rejects a missing tenant context without property reads: %s', async (tenantId) => {
    actAs('estate_manager', { tenantId });
    const sites = vi.spyOn(repos.sites, 'list');
    const units = vi.spyOn(repos.units, 'list');
    await expect(view()).rejects.toThrow('not-found');
    expect(sites).not.toHaveBeenCalled();
    expect(units).not.toHaveBeenCalled();
  });

  it('terminates a signed-out request before reading scoped data', async () => {
    boundary.requireOperatorSession.mockRejectedValue(new Error('redirect:/login'));
    const sites = vi.spyOn(repos.sites, 'list');
    const units = vi.spyOn(repos.units, 'list');
    await expect(view()).rejects.toThrow('redirect:/login');
    expect(sites).not.toHaveBeenCalled();
    expect(units).not.toHaveBeenCalled();
  });

  it('does not widen an empty or unknown estate assignment', async () => {
    const session = actAs('estate_manager', { estateIds: [], allEstates: false });
    const before = structuredClone(session.actor);
    expect((await view()).properties).toEqual([]);
    expect(session.actor).toEqual(before);
    actAs('estate_manager', { estateIds: ['unknown-estate'], allEstates: false });
    expect((await view()).properties).toEqual([]);
  });

  it('returns read-only Properties for a Facility Manager without introducing creation permission', async () => {
    actAs('facility_manager');
    const result = await view();
    expect(result.properties.map((property) => property.id)).toEqual(['s-gardens']);
    expect(result.actions.props.canAddProperty).toBe(false);
    expect(result.actions.props.canAddTenant).toBe(false);
  });

  it('offers only local-demo property creation to the existing authorised estate manager', async () => {
    const result = await view();
    expect(result.demo).toBe(true);
    expect(result.actions.props).toMatchObject({ canAddProperty: true, canAddTenant: false, units: [], demo: true, asOfDate: '2026-07-26' });
  });

  it.each([
    ['production', 'memory'],
    ['development', 'http'],
    ['development', 'postgres'],
  ])('never enables demo creation in %s with %s data source', async (environment, source) => {
    vi.stubEnv('NODE_ENV', environment);
    vi.stubEnv('DATA_SOURCE', source);
    if (source === 'postgres') {
      await expect(view()).rejects.toThrow('Durable operational storage requires a configured, verified workspace identity.');
      expect(boundary.requireOperatorSession).not.toHaveBeenCalled();
    } else expect((await view()).actions.props.demo).toBe(false);
  });

  it('does not enable local creation for a real Clerk identity or when demo identities are off', async () => {
    actAs('estate_manager', {}, 'clerk');
    expect((await view()).demo).toBe(false);
    expect((await view()).actions.props.demo).toBe(false);
    actAs('estate_manager');
    boundary.devIdentityEnabled.mockReturnValue(false);
    expect((await view()).actions.props.demo).toBe(false);
  });

  it('uses the Lagos date rather than UTC for the live-session creation date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-23T23:30:00Z'));
    actAs('estate_manager', {}, 'clerk');
    expect((await view()).actions.props.asOfDate).toBe('2026-10-24');
  });

  it('includes complete scoped pagination and newly registered canonical property records', async () => {
    actAs('executive');
    const baseSite = db.sites.find((site) => site.id === 's-gardens')!;
    const baseUnit = db.units.find((unit) => unit.siteId === baseSite.id)!;
    for (let index = 0; index < 205; index++) {
      const id = `new-estate-${index}`;
      db.sites.push({ ...baseSite, id: asId<Site['id']>(id), name: `New Estate ${index}`, address: `${index} Canonical Road, Lagos` });
      db.units.push({ ...baseUnit, id: asId<Unit['id']>(`new-unit-${index}`), siteId: asId<Site['id']>(id), label: `Canonical unit ${index}` });
    }
    const sites = vi.spyOn(repos.sites, 'list');
    const units = vi.spyOn(repos.units, 'list');
    const result = await view();
    expect(sites.mock.calls.length).toBeGreaterThan(1);
    expect(units.mock.calls.length).toBeGreaterThan(1);
    expect(result.properties).toHaveLength(206);
    expect(result.properties.find((property) => property.id === 'new-estate-204')).toMatchObject({ name: 'New Estate 204', unitCount: 1, units: [{ id: 'new-unit-204', label: 'Canonical unit 204' }] });
    for (const [actor] of [...sites.mock.calls, ...units.mock.calls]) expect(actor.tenantId).toBe('t-lekki');
  });
});

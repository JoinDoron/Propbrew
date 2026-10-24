import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@/server/data/store';
import { repos } from '@/server/data';
import { identityByKey, SEED } from '@/server/identities';
import type { Actor } from '@/lib/authz';
import { withCreatedEstateAssignments } from '@/server/data/estate-creation-scope';

const boundary = vi.hoisted(() => ({ getSession: vi.fn(), devIdentityEnabled: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('@/server/session', () => ({ getSession: boundary.getSession, devIdentityEnabled: boundary.devIdentityEnabled }));
vi.mock('next/cache', () => ({ revalidatePath: boundary.revalidatePath }));
import { addEstateProperty, addEstateTenant } from '@/server/actions/estate-registration';

const initialStore = structuredClone(db);
const property = () => ({ name: 'Palm Court', address: '14 Example Road, Lagos', unitCount: 3, unitType: '2-bed apartment', idempotencyKey: randomUUID() });
const tenant = (unitId = 'u-c06a') => ({ name: 'Ada Example', unitId, moveInDate: '2026-07-26', household: 2, email: 'Ada@Example.com', phone: '+2348030000099', idempotencyKey: randomUUID() });

function actAs(key = 'estate_manager', overrides: Partial<Actor> = {}) {
  const identity = identityByKey(key);
  const session = { ...identity, actor: { ...identity.actor, ...overrides } };
  boundary.getSession.mockResolvedValue(session);
  return session;
}

function counts() {
  return {
    sites: db.sites.length, buildings: db.buildings.length, units: db.units.length, residents: db.residents.length,
    assignments: db.estateCreatorAssignments.length, receipts: db.estateRegistrationReceipts.length, audit: db.estateRegistrationAudit.length,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(db, structuredClone(initialStore));
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DATA_SOURCE', '');
  actAs();
  boundary.devIdentityEnabled.mockReturnValue(true);
});

afterEach(() => {
  Object.assign(db, structuredClone(initialStore));
  vi.unstubAllEnvs();
});

describe('demo estate property registration', () => {
  it('creates one attributed property, one building, exact vacant inventory and only its creator assignment', async () => {
    const session = actAs();
    const before = counts();
    const input = property();
    const result = await addEstateProperty(input);
    expect(result).toMatchObject({ ok: true, name: input.name });
    if (!result.ok) throw new Error(result.error);
    expect(counts()).toEqual({ sites: before.sites + 1, buildings: before.buildings + 1, units: before.units + input.unitCount, residents: before.residents, assignments: 1, receipts: 1, audit: 1 });
    const site = db.sites.find((row) => row.id === result.id)!;
    expect(site).toMatchObject({ tenantId: SEED.tenantA, kind: 'estate', name: input.name, address: input.address, unitCount: 3, buildingCount: 1 });
    const units = db.units.filter((row) => row.siteId === site.id);
    expect(units).toHaveLength(3);
    expect(units.every((unit) => unit.tenantId === site.tenantId && unit.occupancy === 'vacant' && unit.type === input.unitType)).toBe(true);
    expect(new Set(units.map((unit) => unit.id)).size).toBe(3);
    expect(db.estateCreatorAssignments[0]).toMatchObject({ tenantId: SEED.tenantA, userId: session.actor.userId, siteId: result.id });
    expect(db.estateRegistrationAudit[0]).toMatchObject({ tenantId: SEED.tenantA, actorId: session.actor.userId, entityId: result.id, action: 'property.created' });
    for (const path of ['/estate', '/properties', '/people', '/tenancy', '/spaces', '/portfolio', '/workspaces']) expect(boundary.revalidatePath).toHaveBeenCalledWith(path);
    const createdActor = withCreatedEstateAssignments(session.actor);
    expect(repos.sites.list(createdActor).items.some((row) => row.id === result.id)).toBe(true);
    expect(repos.buildings.list(createdActor).items.some((row) => row.siteId === result.id)).toBe(true);
    expect(repos.units.list(createdActor).items.filter((row) => row.siteId === result.id)).toHaveLength(3);
    expect(session.actor.estateIds).toEqual([SEED.estateGardens]);
  });

  it('replays the same payload and key without duplicating inventory, audit or assignments', async () => {
    const input = property();
    const first = await addEstateProperty(input);
    const after = counts();
    expect(await addEstateProperty({ ...input, name: ` ${input.name} ` })).toEqual(first);
    expect(counts()).toEqual(after);
  });

  it('normalizes multiline addresses while rejecting other control characters', async () => {
    const result = await addEstateProperty({ ...property(), address: '14 Example Road\r\nLekki, Lagos' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(db.sites.find((site) => site.id === result.id)?.address).toBe('14 Example Road Lekki, Lagos');
    const after = counts();
    expect(await addEstateProperty({ ...property(), address: '14 Example\u0000Road' })).toMatchObject({ ok: false });
    expect(counts()).toEqual(after);
  });

  it('rejects idempotency-key reuse with changed property details before any partial write', async () => {
    const input = property();
    await addEstateProperty(input);
    const after = counts();
    expect(await addEstateProperty({ ...input, unitCount: 4 })).toMatchObject({ ok: false, error: expect.stringContaining('different details') });
    expect(counts()).toEqual(after);
  });

  it('binds receipt keys to authenticated user and tenant rather than global client strings', async () => {
    const input = property();
    const first = await addEstateProperty(input);
    const secondActor = actAs('estate_manager', { userId: 'another-manager' });
    const second = await addEstateProperty(input);
    const foreignActor = actAs('estate_manager', { tenantId: SEED.tenantB, estateIds: [SEED.estateIkoyi] });
    const third = await addEstateProperty(input);
    expect(first.ok && second.ok && third.ok).toBe(true);
    if (!first.ok || !second.ok || !third.ok) throw new Error('Each authorised creator should own its separate submission.');
    expect(new Set([first.id, second.id, third.id]).size).toBe(3);
    expect(withCreatedEstateAssignments(secondActor.actor).estateIds).toContain(second.id);
    expect(withCreatedEstateAssignments(secondActor.actor).estateIds).not.toContain(first.id);
    expect(withCreatedEstateAssignments(foreignActor.actor).estateIds).toContain(third.id);
    expect(repos.sites.list(withCreatedEstateAssignments(secondActor.actor)).items.some((row) => row.id === third.id)).toBe(false);
  });

  it.each([0, -1, 201, 1.5, '2', null, NaN])('rejects invalid unit count %s atomically', async (unitCount) => {
    const before = counts();
    expect(await addEstateProperty({ ...property(), unitCount })).toMatchObject({ ok: false });
    expect(counts()).toEqual(before);
    expect(boundary.revalidatePath).not.toHaveBeenCalled();
  });

  it('accepts the 200-unit inventory bound without silently truncating returned repository pages', async () => {
    const session = actAs();
    const result = await addEstateProperty({ ...property(), unitCount: 200 });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const current = withCreatedEstateAssignments(session.actor);
    expect(db.units.filter((row) => row.siteId === result.id)).toHaveLength(200);
    expect(repos.units.list(current, { limit: 200 }).total).toBe(210);
    expect(repos.units.list(current, { limit: 200 }).cursor).toBe('200');
  });

  it.each(['tenantId', 'userId', 'actorId', 'ownerUserId', 'roles', 'estateIds', 'allEstates', 'id', 'siteId'])
    ('rejects caller-controlled property ownership field %s', async (field) => {
      const before = counts();
      expect(await addEstateProperty({ ...property(), [field]: 'forged-value' })).toMatchObject({ ok: false });
      expect(counts()).toEqual(before);
    });
});

describe('demo estate tenant registration', () => {
  it('adds a scoped tenant contact record and occupied unit without creating an auth account, invitation or bill', async () => {
    const session = actAs();
    const before = counts();
    const users = structuredClone(db.users);
    const invoices = structuredClone(db.invoices);
    const input = { ...tenant(), email: ' Ada@Example.com ' };
    const result = await addEstateTenant(input);
    expect(result).toMatchObject({ ok: true, name: input.name });
    if (!result.ok) throw new Error(result.error);
    const resident = db.residents.find((row) => row.id === result.id)!;
    expect(resident).toMatchObject({ tenantId: SEED.tenantA, name: input.name, unitId: input.unitId, status: 'active', household: 2, email: 'ada@example.com', phone: input.phone, balance: { minor: 0, currency: 'NGN' } });
    expect(resident.userId).toMatch(/^unlinked-resident-/);
    expect(db.units.find((row) => row.id === input.unitId)?.occupancy).toBe('occupied');
    expect(boundary.revalidatePath).toHaveBeenCalledWith('/properties');
    expect(db.users).toEqual(users);
    expect(db.invoices).toEqual(invoices);
    expect(counts()).toEqual({ ...before, residents: before.residents + 1, receipts: before.receipts + 1, audit: before.audit + 1 });
    expect(repos.residents.list(session.actor).items.some((row) => row.id === result.id)).toBe(true);
    expect(db.estateRegistrationAudit.at(-1)).toMatchObject({ action: 'resident.created', actorId: session.actor.userId, tenantId: SEED.tenantA, unitId: input.unitId });
    expect(JSON.stringify(db.estateRegistrationAudit)).not.toContain(input.email.trim().toLowerCase());
  });

  it('records a future move-in as invited/reserved, never already occupied', async () => {
    const result = await addEstateTenant({ ...tenant(), moveInDate: '2026-08-01' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(db.residents.find((row) => row.id === result.id)?.status).toBe('invited');
    expect(db.units.find((row) => row.id === 'u-c06a')?.occupancy).toBe('reserved');
  });

  it('replays a completed tenant submission before rechecking the now-occupied unit', async () => {
    const input = tenant();
    const first = await addEstateTenant(input);
    const after = counts();
    expect(await addEstateTenant(input)).toEqual(first);
    expect(counts()).toEqual(after);
    expect(await addEstateTenant({ ...input, idempotencyKey: randomUUID() })).toMatchObject({ ok: false });
    expect(counts()).toEqual(after);
  });

  it('rejects reuse of a tenant submission key with changed data', async () => {
    const input = tenant();
    await addEstateTenant(input);
    const after = counts();
    expect(await addEstateTenant({ ...input, household: 3 })).toMatchObject({ ok: false, error: expect.stringContaining('different details') });
    expect(counts()).toEqual(after);
  });

  it('permits a tenant in a newly created property through trusted creator scope on the next action', async () => {
    const result = await addEstateProperty(property());
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    const unit = db.units.find((row) => row.siteId === result.id)!;
    expect(await addEstateTenant(tenant(unit.id))).toMatchObject({ ok: true });
    expect(unit.occupancy).toBe('occupied');
  });

  it('denies same-tenant properties created by another manager and all foreign-tenant units', async () => {
    actAs('estate_manager', { userId: 'other-manager' });
    const created = await addEstateProperty(property());
    expect(created.ok).toBe(true);
    if (!created.ok) throw new Error(created.error);
    const unassigned = db.units.find((row) => row.siteId === created.id)!;
    actAs();
    const before = counts();
    for (const unitId of [unassigned.id, 'u-v508', 'u-ikoyi-1', 'missing-unit']) {
      expect(await addEstateTenant(tenant(unitId))).toMatchObject({ ok: false });
      expect(counts()).toEqual(before);
    }
    expect(unassigned.occupancy).toBe('vacant');
  });

  it('does not use a facility unit for Estate registration even when a mixed-role actor can read it', async () => {
    actAs('facility_manager', { roles: ['estate_manager', 'facility_manager'] });
    const before = counts();
    expect(await addEstateTenant(tenant('u-v508'))).toMatchObject({ ok: false });
    expect(counts()).toEqual(before);
  });

  it('rejects a nominally vacant unit that already has an invited resident record', async () => {
    const before = counts();
    expect(db.units.find((unit) => unit.id === 'u-d04c')?.occupancy).toBe('vacant');
    expect(await addEstateTenant(tenant('u-d04c'))).toMatchObject({ ok: false });
    expect(counts()).toEqual(before);
  });

  it.each(['occupied', 'reserved', 'unavailable'] as const)('rejects a unit currently %s without partial resident creation', async (occupancy) => {
    db.units.find((unit) => unit.id === 'u-c06a')!.occupancy = occupancy;
    const before = counts();
    expect(await addEstateTenant(tenant())).toMatchObject({ ok: false });
    expect(counts()).toEqual(before);
  });

  it.each(['2026-02-30', '2026-13-01', 'today', '', '2026-07-26T00:00:00Z', '1899-12-31', '2101-01-01'])('rejects invalid move-in date %s', async (moveInDate) => {
    const before = counts();
    expect(await addEstateTenant({ ...tenant(), moveInDate })).toMatchObject({ ok: false });
    expect(counts()).toEqual(before);
    expect(db.units.find((row) => row.id === 'u-c06a')?.occupancy).toBe('vacant');
  });

  it.each(['tenantId', 'userId', 'actorId', 'ownerUserId', 'role', 'roles', 'siteId', 'estateIds', 'status', 'balance'])
    ('rejects caller-controlled tenant ownership or permission field %s', async (field) => {
      const before = counts();
      expect(await addEstateTenant({ ...tenant(), [field]: 'forged-value' })).toMatchObject({ ok: false });
      expect(counts()).toEqual(before);
    });

  it.each([{ household: 0 }, { household: 51 }, { household: '2' }, { email: 'not-an-email' }, { phone: 'javascript:alert(1)' }])
    ('validates tenant details %j before writing', async (details) => {
      const before = counts();
      expect(await addEstateTenant({ ...tenant(), ...details })).toMatchObject({ ok: false });
      expect(counts()).toEqual(before);
    });

  it('allows optional blank contacts without inventing a contact address', async () => {
    const result = await addEstateTenant({ ...tenant(), email: '', phone: '' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.error);
    expect(db.residents.find((row) => row.id === result.id)).toMatchObject({ email: undefined, phone: undefined });
  });

  it('cannot reuse a property submission key for a different operation', async () => {
    const input = property();
    await addEstateProperty(input);
    const after = counts();
    expect(await addEstateTenant({ ...tenant(), idempotencyKey: input.idempotencyKey })).toMatchObject({ ok: false, error: expect.stringContaining('different details') });
    expect(counts()).toEqual(after);
  });
});

describe('registration environment and authorization boundary', () => {
  it.each(['executive', 'facility_manager', 'technician', 'security', 'resident', 'vendor', 'investor', 'platform_admin'])
    ('denies %s before any record or scope mutation', async (key) => {
      actAs(key);
      const before = counts();
      expect(await addEstateProperty(property())).toMatchObject({ ok: false });
      expect(await addEstateTenant(tenant())).toMatchObject({ ok: false });
      expect(counts()).toEqual(before);
      expect(boundary.revalidatePath).not.toHaveBeenCalled();
    });

  it.each([null, '', '   '])('requires an explicit tenant (%s)', async (tenantId) => {
    actAs('estate_manager', { tenantId });
    const before = counts();
    expect(await addEstateProperty(property())).toMatchObject({ ok: false });
    expect(await addEstateTenant(tenant())).toMatchObject({ ok: false });
    expect(counts()).toEqual(before);
  });

  it('refuses signed-out, disabled-demo and Clerk sessions rather than treating them as demo creators', async () => {
    const before = counts();
    boundary.getSession.mockResolvedValue(null);
    expect(await addEstateProperty(property())).toMatchObject({ ok: false });
    actAs();
    boundary.devIdentityEnabled.mockReturnValue(false);
    expect(await addEstateTenant(tenant())).toMatchObject({ ok: false });
    boundary.devIdentityEnabled.mockReturnValue(true);
    const identity = actAs();
    boundary.getSession.mockResolvedValue({ ...identity, key: 'clerk' });
    expect(await addEstateProperty(property())).toMatchObject({ ok: false });
    expect(await addEstateTenant(tenant())).toMatchObject({ ok: false });
    expect(counts()).toEqual(before);
  });

  it.each(['http', 'postgres'])('fails closed for unconnected durable adapter %s', async (source) => {
    vi.stubEnv('DATA_SOURCE', source);
    const before = counts();
    expect(await addEstateProperty(property())).toMatchObject({ ok: false, error: expect.stringContaining('durable registration adapter') });
    expect(await addEstateTenant(tenant())).toMatchObject({ ok: false });
    expect(boundary.getSession).not.toHaveBeenCalled();
    expect(counts()).toEqual(before);
  });

  it('never reports successful memory registration in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const before = counts();
    expect(await addEstateProperty(property())).toMatchObject({ ok: false });
    expect(await addEstateTenant(tenant())).toMatchObject({ ok: false });
    expect(boundary.getSession).not.toHaveBeenCalled();
    expect(counts()).toEqual(before);
  });
});

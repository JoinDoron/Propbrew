import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember, type CompanyModuleGrants } from '@/lib/auth/company-policy';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { db, getHistory } from '@/server/data/store';
import type { CompanyPrincipal } from '@/server/auth/company';
import type { Asset } from '@/domain/entities';

const boundary = vi.hoisted(() => ({ getSession: vi.fn(), getActor: vi.fn(), requireWorkspace: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('@/server/session', () => ({ getSession: boundary.getSession, getActor: boundary.getActor, devIdentityEnabled: () => false }));
vi.mock('@/server/workspaces', () => ({ requireWorkspace: boundary.requireWorkspace }));
vi.mock('next/cache', () => ({ revalidatePath: boundary.revalidatePath }));
vi.mock('next/headers', () => ({ headers: vi.fn(), cookies: vi.fn() }));
import { addEstateProperty, addEstateTenant, updateEstateProperty, updateEstateTenant } from '@/server/actions/estate-registration';
import { createFacilityAsset, updateFacilityAsset, createFacilityWorkOrder } from '@/server/actions/facility-registration';
import { fireWoTransition } from '@/server/actions/work-orders';

const tenantId = '2a6a42a6-cf85-41af-a942-4b5eed3cd037';
const otherTenant = '39a557f4-d381-4808-82b8-7238d2504810';
const userId = '5bfef2eb-8304-44bb-883b-62b31624d5f2';
let state: WorkspaceRecordState;
const manager: CompanyModuleGrants = { estate: 'manage', facility: 'manage', shortlet: 'manage', construction: 'manage' };
function run<T>(fn: () => T, grants = manager) {
  const actor = actorForCompanyMember({ membershipId: 'verified-crud-member', userId, companyId: tenantId, companyRole: 'member', status: 'active', companyStatus: 'active', estateIds: [], allEstates: true, modules: grants }, userId)!;
  const session = { key: 'company', label: 'QA operator', actor, tenantLabel: 'QA company', roleSummary: 'Team member' };
  boundary.getSession.mockResolvedValue(session); boundary.getActor.mockResolvedValue(actor); boundary.requireWorkspace.mockResolvedValue(session);
  const principal: CompanyPrincipal = { actor, user: { id: userId, name: 'QA operator', email: 'operator@example.invalid' }, session: { id: randomUUID() }, company: { id: tenantId, name: 'QA company' }, sandbox: undefined, membership: { membershipId: 'verified-crud-member', userId, companyId: tenantId, companyRole: 'member', status: 'active', companyStatus: 'active', estateIds: [], allEstates: true, modules: grants, version: '1' } };
  return runWithRecordContext({ state, domainTenantId: tenantId, mode: 'write', companyPrincipal: principal }, fn);
}
function site() { return (state.collections.sites as { id: string; tenantId: string; kind: string; name: string; address: string }[]).find((row) => row.kind === 'estate')!; }
const assetInput = () => ({ siteId: site().id, name: 'QA water pump', category: 'Plumbing', serial: 'QA-UNIQUE-PUMP', locationLabel: 'Ground floor pump room', status: 'operational', purchaseDate: '2025-01-01', warrantyExpiry: '2028-01-01', idempotencyKey: randomUUID() });
const newOrder = () => ({ siteId: site().id, title: 'QA inspect water pump', description: 'Synthetic maintenance request', priority: 'routine', idempotencyKey: randomUUID() });

beforeEach(() => {
  vi.stubEnv('PROPBREW_AUTH_MODE', 'company'); vi.stubEnv('PROPBREW_REVIEW_MODE', '0'); vi.stubEnv('DATA_SOURCE', 'postgres');
  state = createDemoWorkspaceState(tenantId); vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe('Estate record corrections preserve scoped ownership and occupancy', () => {
  it('edits a property name/address while retaining every linked unit and attributed audit', async () => {
    const target = site(), units = structuredClone(state.collections.units);
    expect(await run(() => updateEstateProperty({ id: target.id, name: 'QA amended property', address: '12 Synthetic Avenue, Lagos' }))).toMatchObject({ ok: true, id: target.id });
    expect(target).toMatchObject({ name: 'QA amended property', address: '12 Synthetic Avenue, Lagos', tenantId });
    expect(state.collections.units).toEqual(units);
    expect((state.collections.estateRegistrationAudit as object[]).at(-1)).toMatchObject({ action: 'property.updated', actorId: userId, tenantId });
  });
  it('refuses foreign properties and ownership fields without modifying records', async () => {
    const foreign = { ...site(), id: 'foreign-property', tenantId: otherTenant }; (state.collections.sites as object[]).push(foreign);
    const before = structuredClone(state);
    expect(await run(() => updateEstateProperty({ id: foreign.id, name: 'Intruder', address: '12 Unauthorised Avenue' }))).toMatchObject({ ok: false });
    expect(await run(() => updateEstateProperty({ id: site().id, name: 'Intruder', address: '12 Unauthorised Avenue', tenantId: otherTenant }))).toMatchObject({ ok: false });
    expect(state).toEqual(before);
  });
  it('creates and edits a resident contact, then moves them to a vacant unit atomically', async () => {
    await run(async () => {
      const property = await addEstateProperty({ name: 'QA movable tenants', address: '22 Synthetic Road, Lagos', unitType: 'Studio', unitCount: 2, idempotencyKey: randomUUID() });
      if (!property.ok) throw new Error(property.error);
      const units = db.units.filter((unit) => unit.siteId === property.id);
      const added = await addEstateTenant({ name: 'QA resident', unitId: units[0].id, moveInDate: '2025-01-01', household: 1, idempotencyKey: randomUUID() });
      if (!added.ok) throw new Error(added.error);
      const resident = db.residents.find((row) => row.id === added.id)!;
      const originalIdentity = resident.userId, originalBalance = structuredClone(resident.balance);
      expect(await updateEstateTenant({ id: added.id, name: 'QA renamed resident', email: 'qa@sample.invalid', phone: '+2348000000000', household: 3, unitId: units[1].id })).toMatchObject({ ok: true });
      expect(resident).toMatchObject({ name: 'QA renamed resident', email: 'qa@sample.invalid', household: 3, userId: originalIdentity, unitId: units[1].id, siteId: units[1].siteId, balance: originalBalance });
      expect(units[0].occupancy).toBe('vacant'); expect(units[1].occupancy).toBe('occupied');
      expect(db.estateRegistrationAudit.at(-1)).toMatchObject({ action: 'resident.updated', actorId: userId, entityId: added.id });
    });
  });
  it('rejects an occupied-unit move before changing the resident or any occupancy record', async () => {
    await run(async () => {
      const resident = db.residents.find((row) => row.status === 'active')!;
      const occupied = db.units.find((unit) => unit.id !== resident.unitId && unit.occupancy === 'occupied')!;
      const before = structuredClone(state);
      expect(await updateEstateTenant({ id: resident.id, name: 'Should not save', email: '', phone: '', household: 2, unitId: occupied.id })).toMatchObject({ ok: false });
      expect(state).toEqual(before);
    });
  });
  it('denies a viewer before any Estate edit executes', async () => {
    const before = structuredClone(state);
    await expect(run(() => updateEstateProperty({ id: site().id, name: 'Not allowed', address: '12 Bad Request Avenue' }), { estate: 'view' })).rejects.toThrow('cannot perform');
    expect(state).toEqual(before);
  });
});

describe('Facility asset registration is durable, scoped and idempotent', () => {
  it('creates a fully attributed asset once and safely replays its submission', async () => {
    const input = assetInput(), before = (state.collections.assets as Asset[]).length;
    const first = await run(() => createFacilityAsset(input)); expect(first).toMatchObject({ ok: true, name: input.name });
    expect(await run(() => createFacilityAsset(input))).toEqual(first);
    expect(state.collections.assets).toHaveLength(before + 1);
    const row = (state.collections.assets as Asset[]).find((asset) => asset.serial === input.serial)!;
    expect(row).toMatchObject({ tenantId, siteId: input.siteId, createdBy: userId, updatedBy: userId, archivedAt: null, photos: [] });
    expect(state.auxiliary.facilityRegistrationAudit).toHaveLength(1);
  });
  it('updates an asset while preserving identity, original attribution and site', async () => {
    const input = assetInput(), added = await run(() => createFacilityAsset(input)); if (!added.ok) throw new Error(added.error);
    const row = (state.collections.assets as Asset[]).find((asset) => asset.id === added.id)!;
    const original = { siteId: row.siteId, createdBy: row.createdBy, createdAt: row.createdAt };
    const details = Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'siteId' && key !== 'idempotencyKey'));
    expect(await run(() => updateFacilityAsset({ ...details, id: row.id, name: 'QA repaired pump', status: 'degraded' }))).toMatchObject({ ok: true });
    expect(row).toMatchObject({ ...original, name: 'QA repaired pump', status: 'degraded', updatedBy: userId, tenantId });
  });
  it('adds the optional assets collection for a previously blank company without changing its schema', async () => {
    delete state.collections.assets; expect(await run(() => createFacilityAsset(assetInput()))).toMatchObject({ ok: true });
    expect(state.schemaVersion).toBe(1); expect(state.collections.assets).toHaveLength(1);
  });
  it('rejects invalid dates, duplicate serials and foreign scopes without adding an asset', async () => {
    const input = assetInput(); expect(await run(() => createFacilityAsset(input))).toMatchObject({ ok: true });
    const before = (state.collections.assets as Asset[]).length;
    expect(await run(() => createFacilityAsset({ ...input, idempotencyKey: randomUUID() }))).toMatchObject({ ok: false, error: expect.stringContaining('serial') });
    expect(await run(() => createFacilityAsset({ ...input, serial: 'BAD-DATES', purchaseDate: '2027-01-01', warrantyExpiry: '2026-01-01', idempotencyKey: randomUUID() }))).toMatchObject({ ok: false });
    expect(await run(() => createFacilityAsset({ ...input, siteId: 'foreign-site', serial: 'FOREIGN', idempotencyKey: randomUUID() }))).toMatchObject({ ok: false });
    expect(state.collections.assets).toHaveLength(before);
  });
  it('refuses a foreign asset even if its identifier is known', async () => {
    const first = (state.collections.assets as Asset[])[0], foreign = { ...first, id: 'foreign-asset', tenantId: otherTenant };
    (state.collections.assets as unknown[]).push(foreign);
    expect(await run(() => updateFacilityAsset({ id: foreign.id, name: foreign.name, category: foreign.category, serial: foreign.serial, locationLabel: foreign.locationLabel, status: foreign.status, purchaseDate: foreign.purchaseDate, warrantyExpiry: foreign.warrantyExpiry }))).toMatchObject({ ok: false });
    expect(foreign.updatedBy).toBe(first.updatedBy);
  });
  it('denies creation from another module manager before executing Facility code', async () => {
    const before = structuredClone(state);
    await expect(run(() => createFacilityAsset(assetInput()), { estate: 'manage', facility: 'view' })).rejects.toThrow('cannot perform');
    expect(state).toEqual(before);
  });
});

describe('Facility work orders use the existing normal workflow', () => {
  it('creates an unassigned local record, supports safe retry and normal triage', async () => {
    const input = newOrder(), first = await run(() => createFacilityWorkOrder(input)); expect(first).toMatchObject({ ok: true, ref: expect.stringMatching(/^WO-\d+$/) });
    expect(await run(() => createFacilityWorkOrder(input))).toEqual(first); if (!first.ok || !first.ref) throw new Error('No work order created');
    await run(async () => {
      const row = db.workOrders.find((order) => order.id === first.id)!;
      expect(row).toMatchObject({ tenantId, siteId: input.siteId, status: 'new', requesterUserId: userId, createdBy: userId, assigneeName: 'Unassigned', cost: null });
      expect(getHistory('work-order', row.id)).toEqual([expect.objectContaining({ event: 'CREATE', actorId: userId })]);
      expect(await fireWoTransition(first.ref!, 'TRIAGE')).toEqual({ ok: true, to: 'triaged' });
      expect(row.status).toBe('triaged');
    });
  });
  it('rejects assets from a different location without creating a request', async () => {
    const before = (state.collections.workOrders as unknown[]).length;
    const asset = (state.collections.assets as Asset[]).find((row) => row.siteId !== site().id);
    expect(await run(() => createFacilityWorkOrder({ ...newOrder(), assetId: asset?.id ?? 'unknown-asset' }))).toMatchObject({ ok: false });
    expect(state.collections.workOrders).toHaveLength(before);
  });
});

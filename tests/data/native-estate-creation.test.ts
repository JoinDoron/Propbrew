import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBlankCompanyState } from '@/server/data/company-state';
import { db, getHistory, initialWorkspaceRecordState } from '@/server/data/store';
import { nativeEstateCreationReady } from '@/server/data/company-estate-access';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { actorForCompanyMember, type CompanyModuleGrants } from '@/lib/auth/company-policy';
import type { Actor } from '@/lib/authz';

const boundary = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock('@/server/session', () => ({ getSession: boundary.session, devIdentityEnabled: () => false }));
vi.mock('@/server/workspaces', () => ({ requireWorkspace: async () => {
  const session = await boundary.session(); if (!session) throw new Error('SIGN_IN_REQUIRED'); return session;
} }));
vi.mock('@/server/review-auth', () => ({ reviewModeEnabled: () => process.env.PROPBREW_REVIEW_MODE === '1', isReviewActor: () => false, assertReviewReadiness: () => {} }));
vi.mock('@/server/data/durable-records', () => ({ withDurableMutation: async (fn: () => Promise<unknown>) => fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { addEstateProperty, addEstateTenant } from '@/server/actions/estate-registration';
import { createEstateWorkOrder } from '@/server/actions/estate-work-orders';

const company = '12345678-1234-4234-8234-123456789abc';
const other = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
let state: WorkspaceRecordState;
let owner: Actor;
function member(modules: CompanyModuleGrants = { estate: 'manage' }): Actor {
  const actor = actorForCompanyMember({ membershipId: 'membership-one', userId: 'native-owner', companyId: company,
    status: 'active', companyStatus: 'active', companyRole: 'owner', modules, allEstates: true, estateIds: [] }, 'native-owner');
  if (!actor) throw new Error('Company fixture is invalid.');
  return actor;
}
const run = <T>(fn: () => T, tenant = company, mode: 'read' | 'write' = 'write') => runWithRecordContext({ state, domainTenantId: tenant, mode }, fn);
const request = () => ({ name: 'Registered Company Estate', address: '12 Property Road, Lagos, Nigeria', unitCount: 1, unitType: 'Apartment', idempotencyKey: randomUUID() });
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
  vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('PROPBREW_AUTH_MODE', 'company'); vi.stubEnv('PROPBREW_REVIEW_MODE', '0'); vi.stubEnv('DATA_SOURCE', 'postgres');
  state = createBlankCompanyState(initialWorkspaceRecordState('t-lekki').collections);
  owner = member(); boundary.session.mockResolvedValue({ key: 'company', label: 'Company Owner', actor: owner });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('native Estate creation boundary', () => {
  it('creates an attributed property, current-date resident and Estate work order in production company storage', async () => {
    await run(async () => {
      expect(nativeEstateCreationReady(owner)).toBe(true);
      const propertyInput = request();
      const property = await addEstateProperty(propertyInput);
      expect(property).toMatchObject({ ok: true });
      if (!property.ok) throw new Error(property.error);
      expect(db.sites).toEqual([expect.objectContaining({ tenantId: company, id: property.id })]);
      const unitId = String(db.units[0].id);
      expect(await addEstateTenant({ name: 'Registered Resident', unitId, moveInDate: '2026-10-24', household: 1, idempotencyKey: randomUUID() })).toMatchObject({ ok: true });
      expect(db.residents[0].status).toBe('active'); expect(db.units[0].occupancy).toBe('occupied');
      const input = { siteId: property.id, unitId, title: 'Repair entrance pipe', priority: 'routine', idempotencyKey: randomUUID() };
      const workOrder = await createEstateWorkOrder(input);
      expect(workOrder).toMatchObject({ ok: true });
      if (!workOrder.ok) throw new Error(workOrder.error);
      const order = db.workOrders[0];
      expect(order).toMatchObject({ tenantId: company, ref: workOrder.ref, requesterUserId: owner.userId, status: 'new', assigneeName: 'Unassigned' });
      expect(getHistory('work-order', order.id)).toEqual([expect.objectContaining({ event: 'CREATE', actorId: owner.userId })]);
      expect(await addEstateProperty(propertyInput)).toEqual(property);
      expect(await createEstateWorkOrder(input)).toEqual(workOrder);
      expect(db.sites).toHaveLength(1); expect(db.workOrders).toHaveLength(1);
    });
  });

  it('reserves future native move-ins using the current Lagos date', async () => {
    await run(async () => {
      expect(await addEstateProperty(request())).toMatchObject({ ok: true });
      expect(await addEstateTenant({ name: 'Future Resident', unitId: String(db.units[0].id), moveInDate: '2026-10-25', household: 1, idempotencyKey: randomUUID() })).toMatchObject({ ok: true });
      expect(db.residents[0].status).toBe('invited'); expect(db.units[0].occupancy).toBe('reserved');
    });
  });

  it.each([
    ['no native mode', 'PROPBREW_AUTH_MODE', ''], ['memory adapter', 'DATA_SOURCE', 'memory'],
    ['HTTP adapter', 'DATA_SOURCE', 'http'], ['review also enabled', 'PROPBREW_REVIEW_MODE', '1'],
  ])('does not use company claims to bypass %s', async (_label, key, value) => {
    vi.stubEnv(key, value);
    await run(async () => {
      const before = JSON.stringify(state);
      expect(nativeEstateCreationReady(owner, 'write')).toBe(false);
      expect(await addEstateProperty(request())).toMatchObject({ ok: false });
      expect(await createEstateWorkOrder({ siteId: 'unavailable', title: 'Unapproved create', priority: 'routine', idempotencyKey: randomUUID() })).toMatchObject({ ok: false });
      expect(JSON.stringify(state)).toBe(before);
    });
  });

  it('rejects an absent company membership despite legacy manager roles', async () => {
    const legacy = { ...owner, companyAccess: undefined };
    boundary.session.mockResolvedValue({ key: 'company', actor: legacy });
    await run(async () => {
      expect(nativeEstateCreationReady(legacy)).toBe(false);
      expect(await addEstateProperty(request())).toMatchObject({ ok: false });
      expect(await createEstateWorkOrder({ siteId: 'unavailable', title: 'Unapproved create', priority: 'routine', idempotencyKey: randomUUID() })).toMatchObject({ ok: false });
      expect(db.sites).toEqual([]); expect(db.workOrders).toEqual([]);
    });
  });

  it.each([{ estate: 'view' }, { facility: 'manage' } ] satisfies CompanyModuleGrants[])('rejects missing Estate create access: %j', async (modules) => {
    const actor = member(modules); boundary.session.mockResolvedValue({ key: 'company', actor });
    await run(async () => {
      expect(nativeEstateCreationReady(actor)).toBe(false);
      expect(await addEstateProperty(request())).toMatchObject({ ok: false });
      expect(await createEstateWorkOrder({ siteId: 'unavailable', title: 'Unapproved create', priority: 'routine', idempotencyKey: randomUUID() })).toMatchObject({ ok: false });
      expect(db.sites).toEqual([]); expect(db.workOrders).toEqual([]);
    });
  });

  it('requires a matching write context and never mutates a read-only snapshot', async () => {
    expect(nativeEstateCreationReady(owner)).toBe(false);
    await run(async () => {
      expect(nativeEstateCreationReady(owner, 'write')).toBe(false);
      expect(await addEstateProperty(request())).toMatchObject({ ok: false });
      expect(await createEstateWorkOrder({ siteId: 'unavailable', title: 'Unapproved create', priority: 'routine', idempotencyKey: randomUUID() })).toMatchObject({ ok: false });
    }, company, 'read');
    await run(async () => {
      expect(nativeEstateCreationReady(owner, 'write')).toBe(false);
      expect(await addEstateProperty(request())).toMatchObject({ ok: false });
    }, other);
    expect(state.collections.sites).toEqual([]);
  });

  it('does not accept submitted ownership fields or another company’s estate', async () => {
    await run(async () => {
      expect(await addEstateProperty({ ...request(), tenantId: other })).toMatchObject({ ok: false });
      expect(await createEstateWorkOrder({ siteId: 'foreign-property', title: 'Unauthorized property', priority: 'routine', idempotencyKey: randomUUID() })).toMatchObject({ ok: false });
      expect(db.sites).toEqual([]); expect(db.workOrders).toEqual([]);
    });
  });
});

import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { blankCompanyWorkspaceState, db } from '@/server/data/store';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { identityByKey, SEED } from '@/server/identities';
import type { Actor } from '@/lib/authz';
import type { Resident, Site, Unit } from '@/domain/entities';
import { money } from '@/domain/primitives';
import { tenancyMinor, tenancyAgreementInputSchema, type TenancyAgreementInput } from '@/domain/estate/tenancy-setup';
import { tenancySetupState } from '@/server/reads/tenancy-setup';

const boundary = vi.hoisted(() => ({ actor: vi.fn(), refresh: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.actor }));
vi.mock('next/cache', () => ({ revalidatePath: boundary.refresh }));
import { createEstateTenancyAgreement, updateEstateTenancyAgreement } from '@/server/actions/estate-tenancy-setup';
import { advanceTenancy } from '@/server/actions/estate';
let state: WorkspaceRecordState;
let actor: Actor;
const company = String(SEED.tenantA), siteId = String(SEED.estateGardens);
const residentId = 'resident-agreement-test', unitId = 'unit-agreement-test';
function input(overrides: Partial<TenancyAgreementInput> = {}): TenancyAgreementInput {
  return { companyScope: company, residentId, expectedUnitId: unitId, startDate: '2026-11-01', endDate: '2027-10-31',
    rentAmount: '1234567.89', depositAmount: '250000.25', rentFrequency: 'yearly', agreementReference: 'AG-2026-01',
    notes: 'Reviewed terms\nParking included', idempotencyKey: randomUUID(), ...overrides };
}
async function within<T>(fn: () => Promise<T>): Promise<T> {
  return runWithRecordContext({ domainTenantId: company, state, mode: 'write' }, fn);
}
function fixture() {
  const tenantId = actor.tenantId!;
  db.sites.push({ tenantId, id: siteId, kind: 'estate', name: 'Agreement Court', address: 'Synthetic Lagos address', buildingCount: 1, unitCount: 2 } as unknown as Site);
  db.units.push({ tenantId, id: unitId, siteId, buildingId: 'building-agreement-test', label: 'Unit 99', type: 'Apartment', occupancy: 'occupied' } as unknown as Unit);
  db.residents.push({ tenantId, id: residentId, userId: 'unlinked-agreement-resident', name: 'Ada Agreement', unitId, siteId, status: 'active', household: 1, balance: money(0, 'NGN'), moveInDate: '2026-11-01' } as unknown as Resident);
}
beforeEach(async () => {
  vi.clearAllMocks(); state = blankCompanyWorkspaceState(); actor = identityByKey('estate_manager').actor; boundary.actor.mockResolvedValue(actor);
  await within(async () => fixture());
});

describe('exact tenancy money and date validation', () => {
  it('preserves every kobo without binary multiplication or silent rounding', () => {
    expect(tenancyMinor('1234567.89')).toBe(123456789); expect(tenancyMinor('0.01', true)).toBe(1);
    expect(tenancyMinor('90071992547409.91')).toBe(Number.MAX_SAFE_INTEGER);
    for (const value of ['1.001', '1e3', '-1', 'NaN', 'Infinity', '1,000', '01', '90071992547409.92']) expect(tenancyMinor(value)).toBeNull();
    expect(tenancyMinor('0', true)).toBeNull(); expect(tenancyMinor('0')).toBe(0);
  });
  it.each(['2026-02-30', '2026-13-01', '2026-1-1', '2101-01-01'])('rejects impossible or unsupported date %s', (date) => {
    expect(tenancyAgreementInputSchema.safeParse(input({ startDate: date })).success).toBe(false);
  });
});

describe('company tenancy agreement creation and editing', () => {
  it('creates only a scoped applied agreement with exact rent and pending deposit, preserving occupancy', async () => within(async () => {
    const result = await createEstateTenancyAgreement(input()); expect(result.ok).toBe(true);
    expect(db.tenancies).toHaveLength(1);
    expect(db.tenancies[0]).toMatchObject({ tenantId: company, estateId: siteId, residentName: 'Ada Agreement', stage: 'applied', rentMinor: 123456789, depositMinor: 25000025, depositStatus: 'pending', moveInISO: '2026-11-01', leaseEndISO: '2027-10-31' });
    expect(db.units[0].occupancy).toBe('occupied');
    expect(tenancySetupState().agreements[0]).toMatchObject({ residentId, unitId, version: 1, rentFrequency: 'yearly', agreementReference: 'AG-2026-01' });
    expect(tenancySetupState().audit[0].action).toBe('agreement.created');
  }));
  it('makes creation retries idempotent and rejects key reuse with different terms', async () => within(async () => {
    const request = input(); const first = await createEstateTenancyAgreement(request);
    expect(await createEstateTenancyAgreement(request)).toEqual(first);
    expect(await createEstateTenancyAgreement({ ...request, rentAmount: '99.99' })).toMatchObject({ ok: false });
    expect(db.tenancies).toHaveLength(1); expect(tenancySetupState().audit).toHaveLength(1);
  }));
  it('rejects overlapping open agreements but permits a later non-overlapping lease', async () => within(async () => {
    expect((await createEstateTenancyAgreement(input())).ok).toBe(true);
    expect(await createEstateTenancyAgreement(input({ startDate: '2027-10-31', endDate: '2028-10-31' }))).toMatchObject({ ok: false, error: expect.stringContaining('overlapping') });
    expect((await createEstateTenancyAgreement(input({ startDate: '2027-11-01', endDate: '2028-10-31' }))).ok).toBe(true);
    expect(db.tenancies).toHaveLength(2);
  }));
  it('blocks overlapping agreements for the same resident after an inter-estate move', async () => within(async () => {
    expect((await createEstateTenancyAgreement(input())).ok).toBe(true);
    actor = { ...actor, allEstates: true, estateIds: [] }; boundary.actor.mockResolvedValue(actor);
    const secondSite = String(SEED.estateVictoria), secondUnit = 'unit-agreement-other-estate';
    db.sites.push({ ...db.sites[0], id: secondSite, name: 'Other Court' } as unknown as Site);
    db.units.push({ ...db.units[0], id: secondUnit, siteId: secondSite, label: 'Unit 100' } as unknown as Unit);
    Object.assign(db.residents[0], { siteId: secondSite, unitId: secondUnit });
    expect(await createEstateTenancyAgreement(input({ expectedUnitId: secondUnit }))).toMatchObject({ ok: false, error: expect.stringContaining('overlapping') });
    expect(db.tenancies).toHaveLength(1);
  }));
  it.each(['company', 'resident', 'unit', 'estate', 'moved', 'inactive'] as const)('rejects %s scope or stale bindings without writes', async (kind) => within(async () => {
    let request = input();
    if (kind === 'company') request = input({ companyScope: String(SEED.tenantB) });
    if (kind === 'resident') Object.assign(db.residents[0], { tenantId: SEED.tenantB });
    if (kind === 'unit') Object.assign(db.units[0], { tenantId: SEED.tenantB });
    if (kind === 'estate') Object.assign(db.sites[0], { tenantId: SEED.tenantB });
    if (kind === 'moved') request = input({ expectedUnitId: 'previous-unit' });
    if (kind === 'inactive') db.residents[0].status = 'moved_out';
    const before = structuredClone(state);
    expect(await createEstateTenancyAgreement(request)).toMatchObject({ ok: false });
    // A rejected input may initialize its empty sidecar, but no records/receipts are created.
    expect(state.collections).toEqual(before.collections); expect(tenancySetupState().agreements).toHaveLength(0); expect(tenancySetupState().receipts).toHaveLength(0);
  }));
  it('denies read-only and unassigned estate actors', async () => within(async () => {
    for (const current of [identityByKey('executive').actor, { ...actor, estateIds: [SEED.estateVictoria] }]) {
      boundary.actor.mockResolvedValue(current); expect(await createEstateTenancyAgreement(input())).toMatchObject({ ok: false });
    }
    expect(db.tenancies).toHaveLength(0);
  }));
  it('edits only the matching draft version and idempotently replays a successful edit', async () => within(async () => {
    const created = await createEstateTenancyAgreement(input()); if (!created.ok) throw new Error(created.error);
    const update = { ...input({ rentAmount: '750000.50', rentFrequency: 'monthly' }), id: created.id, expectedVersion: 1 };
    expect((await updateEstateTenancyAgreement(update)).ok).toBe(true);
    expect(db.tenancies[0].rentMinor).toBe(75000050); expect(tenancySetupState().agreements[0].version).toBe(2);
    expect((await updateEstateTenancyAgreement(update)).ok).toBe(true); expect(tenancySetupState().agreements[0].version).toBe(2);
    expect(await updateEstateTenancyAgreement({ ...update, idempotencyKey: randomUUID(), rentAmount: '5.00' })).toMatchObject({ ok: false, error: expect.stringContaining('another tab') });
    expect(db.tenancies[0].rentMinor).toBe(75000050);
  }));
  it('protects approved terms and never marks a deposit held through stage changes', async () => within(async () => {
    const created = await createEstateTenancyAgreement(input()); if (!created.ok) throw new Error(created.error);
    expect(await advanceTenancy(created.id, 'applied')).toMatchObject({ ok: true });
    expect(await advanceTenancy(created.id, 'applied')).toMatchObject({ ok: false });
    expect(await advanceTenancy(created.id, 'screening')).toMatchObject({ ok: true });
    expect(await updateEstateTenancyAgreement({ ...input(), id: created.id, expectedVersion: 1 })).toMatchObject({ ok: false, error: expect.stringContaining('protected') });
    expect(await advanceTenancy(created.id, 'approved')).toMatchObject({ ok: true });
    expect(db.tenancies[0]).toMatchObject({ stage: 'moving_in', depositStatus: 'pending' });
    expect(tenancySetupState().audit.filter((row) => row.action === 'stage.changed')).toHaveLength(3);
  }));
  it.each([
    { tenantId: 'foreign' }, { ownerUserId: 'foreign' }, { depositStatus: 'held' }, { stage: 'active' },
  ])('rejects injected authority or financial state %j', async (extra) => within(async () => {
    expect(await createEstateTenancyAgreement({ ...input(), ...extra })).toMatchObject({ ok: false }); expect(db.tenancies).toHaveLength(0);
  }));
});

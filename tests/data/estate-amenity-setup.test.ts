import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember, type CompanyModuleGrants } from '@/lib/auth/company-policy';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { db } from '@/server/data/store';
import type { CompanyPrincipal } from '@/server/auth/company';
import { estateAmenitiesFor, amenityRegistry, bookingTransitionError } from '@/server/estate/amenities';
import type { EstateAmenity } from '@/domain/estate/amenities';

const boundary = vi.hoisted(() => ({ getActor: vi.fn(), getSession: vi.fn(), requireWorkspace: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.getActor, getSession: boundary.getSession }));
vi.mock('@/server/workspaces', () => ({ requireWorkspace: boundary.requireWorkspace }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { createBooking as createResidentBooking } from '@/server/actions/resident-bookings';
import { createEstateAmenity, updateEstateAmenity, archiveEstateAmenity, createEstateAmenityBooking } from '@/server/actions/estate-amenity-setup';

const tenantId = '2a6a42a6-cf85-41af-a942-4b5eed3cd037', userId = '5bfef2eb-8304-44bb-883b-62b31624d5f2';
let state: WorkspaceRecordState;
const manager: CompanyModuleGrants = { estate: 'manage' };
function run<T>(fn: () => T, modules = manager) {
  const membership = { membershipId: 'verified-amenities-member', userId, companyId: tenantId, companyRole: 'member' as const, status: 'active' as const, companyStatus: 'active' as const, estateIds: [], allEstates: true, modules };
  const actor = actorForCompanyMember(membership, userId)!;
  boundary.getActor.mockResolvedValue(actor); boundary.requireWorkspace.mockResolvedValue({ actor, key: 'company', label: 'QA operator' });
  const principal: CompanyPrincipal = { actor, user: { id: userId, name: 'QA operator', email: 'operator@example.invalid' }, session: { id: randomUUID() }, company: { id: tenantId, name: 'QA company' }, sandbox: undefined, membership: { ...membership, version: '1' } };
  return runWithRecordContext({ state, domainTenantId: tenantId, mode: 'write', companyPrincipal: principal }, fn);
}
const registry = () => run(() => amenityRegistry());
const siteId = () => run(() => String(db.sites.find((site) => site.kind === 'estate')!.id));
const create = () => ({ expectedCompanyId: tenantId, idempotencyKey: randomUUID(), siteId: siteId(), name: 'Sandbox Clubhouse', capacity: 1, feeMajor: '0.29', autoApprove: 'manual' as EstateAmenity['autoApprove'], openMinute: 480, closeMinute: 1320, durationMinutes: 120 });
const slot = '2028-11-02T09:00:00.000Z';
async function amenity(input = create()) { const result = await run(() => createEstateAmenity(input)); expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.error); return registry().amenities.find((row) => row.id === result.id)!; }
function booking(row: EstateAmenity) { const residentId = run(() => String(db.residents.find((resident) => resident.siteId === row.siteId && ['active', 'invited'].includes(resident.status))!.id)); const expectedUnitId = run(() => String(db.residents.find((resident) => resident.id === residentId)!.unitId)); return { expectedCompanyId: tenantId, idempotencyKey: randomUUID(), amenityId: row.id, residentId, expectedUnitId, slotISO: slot }; }
const update = (row: EstateAmenity) => ({ expectedCompanyId: tenantId, idempotencyKey: randomUUID(), id: row.id, revision: row.revision, name: row.name, capacity: row.capacity, feeMajor: (row.feeMinor / 100).toFixed(2), autoApprove: row.autoApprove, openMinute: row.openMinute, closeMinute: row.closeMinute, durationMinutes: row.durationMinutes });
beforeEach(() => {
  vi.stubEnv('PROPBREW_AUTH_MODE', 'company'); vi.stubEnv('PROPBREW_REVIEW_MODE', '0'); vi.stubEnv('DATA_SOURCE', 'postgres');
  state = createDemoWorkspaceState(tenantId); vi.clearAllMocks();
});
afterEach(() => vi.unstubAllEnvs());

describe('Estate amenity configuration and reservations', () => {
  it('starts a native company with zero configured amenities, preserving its historical booking records', async () => {
    const before = structuredClone(state);
    expect(await run(async () => estateAmenitiesFor(await boundary.getActor()))).toEqual([]);
    expect(state).toEqual(before);
  });
  it('rejects unknown legacy amenity names instead of inventing a fallback configuration', async () => {
    vi.stubEnv('PROPBREW_AUTH_MODE', '');
    const before = run(() => db.bookings.length);
    expect(await run(() => createResidentBooking('Unknown unregistered amenity', slot))).toMatchObject({ ok: false, error: 'Unknown amenity.' });
    expect(run(() => db.bookings.length)).toBe(before);
  });
  it('creates a scoped exact-fee amenity and safely replays the same request', async () => {
    const input = create(), first = await run(() => createEstateAmenity(input)); expect(first).toMatchObject({ ok: true });
    expect(await run(() => createEstateAmenity(input))).toEqual(first);
    expect(registry().amenities).toHaveLength(1); expect(registry().amenities[0]).toMatchObject({ tenantId, siteId: input.siteId, feeMinor: 29, revision: 1, status: 'active' });
    expect(await run(() => createEstateAmenity({ ...input, name: 'Different' }))).toMatchObject({ ok: false });
    expect(await run(() => createEstateAmenity({ ...input, idempotencyKey: randomUUID(), name: 'sandbox clubhouse' }))).toMatchObject({ ok: false });
  });
  it('rejects foreign locations, authority fields, stale-company forms, invalid fees and invalid opening hours', async () => {
    const input = create();
    for (const change of [{ siteId: 'foreign-site' }, { tenantId: 'other' }, { feeMajor: '0.001' }, { feeMajor: '-2' }, { capacity: 0 }, { openMinute: 1200, closeMinute: 500 }, { durationMinutes: 900 }]) expect(await run(() => createEstateAmenity({ ...input, ...change }))).toMatchObject({ ok: false });
    await expect(run(() => createEstateAmenity({ ...input, expectedCompanyId: 'other' }))).rejects.toThrow('company changed');
    expect(registry().amenities).toHaveLength(0);
  });
  it('denies module viewers before creating an amenity', async () => {
    await expect(run(() => createEstateAmenity(create()), { estate: 'view' })).rejects.toThrow('cannot perform');
    expect(registry().amenities).toHaveLength(0);
  });
  it('checks revision before editing and archives without deleting history', async () => {
    const row = await amenity(), input = update(row);
    expect(await run(() => updateEstateAmenity({ ...input, name: 'Renamed Clubhouse' }))).toMatchObject({ ok: true });
    expect(await run(() => updateEstateAmenity({ ...input, idempotencyKey: randomUUID(), name: 'Stale name' }))).toMatchObject({ ok: false });
    const current = registry().amenities[0]; expect(current.name).toBe('Renamed Clubhouse');
    expect(await run(() => archiveEstateAmenity({ expectedCompanyId: tenantId, idempotencyKey: randomUUID(), id: current.id, revision: current.revision }))).toMatchObject({ ok: true });
    expect(registry().amenities[0].status).toBe('archived'); expect(registry().audit.map((row) => row.action)).toContain('amenity.archived');
    expect(await run(() => updateEstateAmenity({ ...update(current), name: 'Restore' }))).toMatchObject({ ok: false });
  });
  it('records a resident reservation with fee and interval snapshots, with idempotent replay', async () => {
    const row = await amenity(), input = booking(row), count = run(() => db.bookings.length);
    const first = await run(() => createEstateAmenityBooking(input)); expect(first).toMatchObject({ ok: true });
    expect(await run(() => createEstateAmenityBooking(input))).toEqual(first);
    expect(run(() => db.bookings.length)).toBe(count + 1);
    expect(run(() => db.bookings.find((item) => item.id === (first.ok ? first.id : '')))).toMatchObject({ tenantId, amenityId: row.id, status: 'requested', fee: { minor: 29, currency: 'NGN' }, slot, endISO: '2028-11-02T11:00:00.000Z' });
  });
  it('prevents overbooking, edits that invalidate existing reservations and archiving a reserved amenity', async () => {
    const row = await amenity(); expect(await run(() => createEstateAmenityBooking(booking(row)))).toMatchObject({ ok: true });
    expect(await run(() => createEstateAmenityBooking(booking(row)))).toMatchObject({ ok: false, error: expect.stringContaining('capacity') });
    expect(await run(() => updateEstateAmenity({ ...update(row), capacity: 2 }))).toMatchObject({ ok: false });
    expect(await run(() => archiveEstateAmenity({ expectedCompanyId: tenantId, idempotencyKey: randomUUID(), id: row.id, revision: row.revision }))).toMatchObject({ ok: false });
    expect(await run(() => updateEstateAmenity({ ...update(row), feeMajor: '12.00' }))).toMatchObject({ ok: true });
    expect(run(() => db.bookings.find((item) => item.amenityId === row.id)!.fee!.minor)).toBe(29);
  });
  it('rejects unknown amenities, unrelated residents, past slots and times outside opening hours', async () => {
    const row = await amenity(), input = booking(row);
    for (const change of [{ amenityId: 'unknown' }, { residentId: 'other' }, { expectedUnitId: 'stale-unit' }, { slotISO: '2020-01-01T09:00:00.000Z' }, { slotISO: '2028-11-02T22:00:00.000Z' }]) expect(await run(() => createEstateAmenityBooking({ ...input, ...change }))).toMatchObject({ ok: false });
  });
  it('confirms only fee-free automatic reservations and leaves fee-bearing ones awaiting verified payment', async () => {
    const free = await amenity({ ...create(), autoApprove: 'always', feeMajor: '0.00' });
    const first = await run(() => createEstateAmenityBooking(booking(free))); expect(first.ok).toBe(true);
    expect(run(() => db.bookings.find((item) => item.id === (first.ok ? first.id : ''))!)).toMatchObject({ status: 'confirmed', fee: { minor: 0, currency: 'NGN' } });
    const paid = await amenity({ ...create(), name: 'Charged room', autoApprove: 'always' });
    const second = await run(() => createEstateAmenityBooking(booking(paid))); expect(second.ok).toBe(true);
    expect(run(() => db.bookings.find((item) => item.id === (second.ok ? second.id : ''))!.status)).toBe('auto_approved');
  });
  it('rechecks configured capacity and archive status at approval time', async () => {
    const row = await amenity(), result = await run(() => createEstateAmenityBooking(booking(row))); if (!result.ok) throw new Error(result.error);
    await run(async () => { const booked = db.bookings.find((item) => item.id === result.id)!; const actor = await boundary.getActor(); expect(bookingTransitionError(actor, booked, 'APPROVE', 'approved')).toBeNull(); row.status = 'archived'; expect(bookingTransitionError(actor, booked, 'APPROVE', 'approved')).toContain('unavailable'); });
  });
});

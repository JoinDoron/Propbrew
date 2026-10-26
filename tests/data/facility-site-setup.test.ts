import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember, type CompanyModuleGrants } from '@/lib/auth/company-policy';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { blankCompanyWorkspaceState } from '@/server/data/store';
import type { CompanyPrincipal } from '@/server/auth/company';
import type { Site } from '@/domain/entities';
const boundary = vi.hoisted(() => ({ getActor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.getActor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { createFacilitySite } from '@/server/actions/facility-site-setup';
const companyId = '74700000-0000-4000-8000-000000000001', userId = '74700000-0000-4000-8000-000000000002';
let state: WorkspaceRecordState;
function run<T>(fn: () => T, modules: CompanyModuleGrants = { facility: 'manage' }, allEstates = true, verified = true) {
  const membership = { membershipId: 'facility-only-manager', userId, companyId, companyRole: 'member' as const, status: 'active' as const, companyStatus: 'active' as const, estateIds: allEstates ? [] : ['assigned-site'], allEstates, modules };
  const actor = actorForCompanyMember(membership, userId)!; boundary.getActor.mockResolvedValue(actor);
  const principal: CompanyPrincipal = { actor, user: { id: userId, name: 'Facility manager', email: 'qa@example.invalid' }, company: { id: companyId, name: 'Facility-only company' }, session: { id: randomUUID() }, sandbox: undefined, membership: { ...membership, version: '1' } };
  return runWithRecordContext({ state, domainTenantId: companyId, mode: 'write', companyPrincipal: verified ? principal : undefined }, fn);
}
const input = () => ({ expectedCompanyId: companyId, idempotencyKey: randomUUID(), name: 'Victoria Island operations centre', address: '1 Adeola Odeku Street, Lagos, Nigeria' });
beforeEach(() => { vi.stubEnv('PROPBREW_AUTH_MODE', 'company'); vi.stubEnv('PROPBREW_REVIEW_MODE', '0'); vi.stubEnv('DATA_SOURCE', 'postgres'); vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-26T10:30:00Z')); state = blankCompanyWorkspaceState(); vi.clearAllMocks(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('independent Facility company site setup', () => {
  it('lets a verified Facility-only company manager create its first actual site without invented spaces', async () => {
    const result = await run(() => createFacilitySite(input())); expect(result).toMatchObject({ ok: true }); if (!result.ok) throw new Error(result.error);
    expect(state.collections.sites).toEqual([{ tenantId: companyId, id: result.id, name: 'Victoria Island operations centre', address: '1 Adeola Odeku Street, Lagos, Nigeria', kind: 'facility', buildingCount: 0, unitCount: 0 }]);
    expect(state.collections.buildings).toHaveLength(0); expect(state.collections.units).toHaveLength(0); expect(result.id).toMatch(/^facility-[0-9a-f-]{36}$/);
    expect(JSON.stringify(state.auxiliary.facilitySites)).toContain('facility.site_created'); expect(JSON.stringify(state.auxiliary.facilitySites)).toContain('2026-10-26T10:30:00.000Z');
  });
  it('replays exactly once and rejects changed payloads with the same key', async () => {
    const value = input(), first = await run(() => createFacilitySite(value)), second = await run(() => createFacilitySite(value)); expect(first.ok).toBe(true); expect(second).toMatchObject({ ok: true, id: first.ok ? first.id : '' });
    expect(await run(() => createFacilitySite({ ...value, address: 'Changed address' }))).toMatchObject({ ok: false }); expect(state.collections.sites).toHaveLength(1);
    expect(state.auxiliary.facilitySites).toMatchObject({ version: 1, receipts: [expect.objectContaining({ actorId: userId })], audit: [expect.objectContaining({ actorId: userId })] });
  });
  it('prevents duplicate case-folded and compatibility-normalised name/address pairs', async () => {
    const value = { ...input(), name: 'VI Office', address: '15 Lagos Road' }; expect(await run(() => createFacilitySite(value))).toMatchObject({ ok: true });
    expect(await run(() => createFacilitySite({ ...value, idempotencyKey: randomUUID(), name: '  vi   office  ', address: '１５ lagos road' }))).toMatchObject({ ok: false }); expect(state.collections.sites).toHaveLength(1);
  });
  it('rejects a stale company, unverified context, extra authority, invalid strings and malformed keys', async () => {
    for (const change of [{ expectedCompanyId: randomUUID() }, { name: 'x' }, { address: '' }, { name: 'Office\u0000' }, { tenantId: randomUUID() }, { unitCount: 12 }, { idempotencyKey: 'guess' }]) expect(await run(() => createFacilitySite({ ...input(), ...change }))).toMatchObject({ ok: false });
    expect(await run(() => createFacilitySite(input()), { facility: 'manage' }, true, false)).toMatchObject({ ok: false }); expect(state.collections.sites).toHaveLength(0);
  });
  it('denies viewers, other-module operators and site-restricted managers', async () => {
    await expect(run(() => createFacilitySite(input()), { facility: 'view' })).rejects.toThrow('cannot perform');
    await expect(run(() => createFacilitySite(input()), { estate: 'manage' })).rejects.toThrow('cannot perform');
    expect(await run(() => createFacilitySite(input()), { facility: 'manage' }, false)).toMatchObject({ ok: false, error: expect.stringContaining('company-wide') }); expect(state.collections.sites).toHaveLength(0);
  });
  it('enforces the bounded company site register without partially adding records', async () => {
    state.collections.sites = Array.from({ length: 1000 }, (_, index) => ({ tenantId: companyId, id: `site-${index}`, kind: 'facility', name: `Site ${index}`, address: `Address ${index}`, buildingCount: 0, unitCount: 0 } as Site));
    expect(await run(() => createFacilitySite(input()))).toMatchObject({ ok: false, error: expect.stringContaining('1,000') }); expect(state.collections.sites).toHaveLength(1000); expect(state.auxiliary.facilitySites).toBeUndefined();
  });
});

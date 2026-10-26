import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember, type CompanyMembershipRecord } from '@/lib/auth/company-policy';
import { EMPTY_OWNER_SETUP, type OwnerSetupDraft } from '@/domain/owner-onboarding';

const boundary = vi.hoisted(() => ({ principal: vi.fn(), save: vi.fn(), complete: vi.fn(), revalidate: vi.fn(), clerk: vi.fn() }));
vi.mock('@/server/auth/mode', () => ({ nativeAuthEnabled: () => true }));
vi.mock('@/server/auth/company', () => ({ getCompanyPrincipal: boundary.principal }));
vi.mock('@clerk/nextjs/server', () => ({ auth: boundary.clerk }));
vi.mock('next/cache', () => ({ revalidatePath: boundary.revalidate }));
vi.mock('@/server/onboarding/repository', async () => ({
  ...await import('@/server/onboarding/contracts'), saveOwnerSetup: boundary.save, completeOwnerSetup: boundary.complete,
}));
import { getOwnerIdentity } from '@/server/onboarding/identity';
import { saveOwnerSetupAction, completeOwnerSetupAction } from '@/server/actions/owner-onboarding';

const companyId = '38000000-0000-4000-8000-000000000001';
const subject = `company:${companyId}`;
function principal(role: 'owner' | 'admin' | 'member' = 'owner', userId = '48000000-0000-4000-8000-000000000001', estate: 'manage' | 'view' = 'manage') {
  const membership: CompanyMembershipRecord = { membershipId: '58000000-0000-4000-8000-000000000001', companyId, userId,
    companyRole: role, status: 'active', companyStatus: 'active', modules: { estate }, estateIds: [], allEstates: true };
  const actor = actorForCompanyMember(membership, userId)!;
  return { user: { id: userId, name: 'Ada Okafor', email: 'ada@example.test' }, session: { id: '68000000-0000-4000-8000-000000000001' },
    company: { id: companyId, name: 'Palm Court Properties' }, membership: { ...membership, version: '1' }, actor };
}
function completeDraft(): OwnerSetupDraft {
  return { ...structuredClone(EMPTY_OWNER_SETUP), portfolioType: 'growing_landlord', propertyCount: 'two_to_five', tenantCount: 'none',
    rentWorkflow: 'spreadsheets', rentPaymentMethods: ['bank_transfer', 'cash_manual'], priority: 'records', step: 6,
    firstProperty: { name: 'Palm Court', address: '12 Example Street', city: 'Lagos', state: 'Lagos', country: 'NG', propertyType: 'building', units: 3 } };
}
beforeEach(() => {
  vi.clearAllMocks(); boundary.principal.mockResolvedValue(principal());
  boundary.save.mockImplementation(async (_subject: string, draft: OwnerSetupDraft, version: number) => ({ draft, version: version + 1, completedAt: null, updatedAt: '2026-10-26T12:00:00.000Z' }));
  boundary.complete.mockImplementation(async (_subject: string, draft: OwnerSetupDraft, version: number) => ({ draft, version: version + 1,
    completedAt: '2026-10-26T12:00:00.000Z', updatedAt: '2026-10-26T12:00:00.000Z', activatedProperty: { id: 'estate-record', name: draft.firstProperty.name, unitCount: draft.firstProperty.units } }));
});
afterEach(() => vi.unstubAllEnvs());

describe('native owner setup identity', () => {
  it('derives a company-bound owner identity from the verified membership', async () => {
    expect(await getOwnerIdentity()).toEqual({ subject, mode: 'company', companyName: 'Palm Court Properties', hasWorkspace: true, onboardingRequired: false, homeRoute: '/estate' });
  });
  it.each(['admin', 'member'] as const)('keeps invited %s accounts out of the owner setup flow', async (role) => {
    boundary.principal.mockResolvedValue(principal(role)); expect(await getOwnerIdentity()).toBeNull();
  });
  it('rejects signed-out, demo and read-only owner accounts', async () => {
    for (const value of [null, principal('owner', '8fd60a0b-3fd5-4301-8f01-8c42c2e34d01'), principal('owner', undefined, 'view')]) {
      boundary.principal.mockResolvedValue(value); expect(await getOwnerIdentity()).toBeNull();
    }
  });
  it('uses native authority even when old Clerk configuration remains present', async () => {
    vi.stubEnv('CLERK_SECRET_KEY', 'unused'); vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'unused');
    boundary.principal.mockResolvedValue(null); expect(await getOwnerIdentity()).toBeNull(); expect(boundary.clerk).not.toHaveBeenCalled();
  });
});

describe('native owner setup action scope binding', () => {
  it.each([undefined, 'company:another-company', 'owner-user', ''])('rejects a missing or stale form scope %j without persistence', async (scope) => {
    for (const action of [saveOwnerSetupAction, completeOwnerSetupAction]) expect(await action(completeDraft(), 0, scope)).toMatchObject({ ok: false, error: expect.stringContaining('changed') });
    expect(boundary.save).not.toHaveBeenCalled(); expect(boundary.complete).not.toHaveBeenCalled(); expect(boundary.revalidate).not.toHaveBeenCalled();
  });
  it('saves only for the current verified company and refreshes its setup views', async () => {
    expect(await saveOwnerSetupAction(EMPTY_OWNER_SETUP, 0, subject)).toMatchObject({ ok: true, record: { version: 1 } });
    expect(boundary.save).toHaveBeenCalledExactlyOnceWith(subject, EMPTY_OWNER_SETUP, 0);
    expect(boundary.revalidate).toHaveBeenCalledWith('/workspaces');
  });
  it('returns the committed operational property reference on completion', async () => {
    const draft = completeDraft(); const result = await completeOwnerSetupAction(draft, 3, subject);
    expect(result).toMatchObject({ ok: true, record: { activatedProperty: { name: 'Palm Court', unitCount: 3 }, completedAt: expect.any(String) } });
    expect(boundary.complete).toHaveBeenCalledExactlyOnceWith(subject, draft, 3); expect(boundary.revalidate).toHaveBeenCalledWith('/properties');
  });
  it('rejects authority fields inside a correctly scoped form', async () => {
    const draft = completeDraft();
    expect(await completeOwnerSetupAction({ ...draft, tenantId: companyId }, 0, subject)).toMatchObject({ ok: false });
    expect(await completeOwnerSetupAction({ ...draft, firstProperty: { ...draft.firstProperty, userId: 'victim' } }, 0, subject)).toMatchObject({ ok: false });
    expect(boundary.complete).not.toHaveBeenCalled();
  });
  it('rechecks owner eligibility on every submission', async () => {
    await saveOwnerSetupAction(EMPTY_OWNER_SETUP, 0, subject); boundary.save.mockClear(); boundary.principal.mockResolvedValue(principal('member'));
    expect(await saveOwnerSetupAction(EMPTY_OWNER_SETUP, 1, subject)).toMatchObject({ ok: false, error: expect.stringContaining('sign in') });
    expect(boundary.save).not.toHaveBeenCalled();
  });
});

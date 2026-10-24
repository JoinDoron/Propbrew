import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor, Role } from '@/lib/authz';
import type { DevIdentity } from '@/server/identities';
import { EMPTY_OWNER_SETUP, type OwnerSetupDraft } from '@/domain/owner-onboarding';

const boundary = vi.hoisted(() => ({
  getSession: vi.fn(),
  auth: vi.fn(),
  save: vi.fn(),
  complete: vi.fn(),
}));

vi.mock('@/server/session', () => ({ getSession: boundary.getSession }));
vi.mock('@clerk/nextjs/server', () => ({ auth: boundary.auth }));
vi.mock('@/server/onboarding/repository', () => ({
  saveOwnerSetup: boundary.save,
  completeOwnerSetup: boundary.complete,
  OnboardingConflictError: class OnboardingConflictError extends Error {},
}));

import { clerkConfigured, getOwnerIdentity } from '@/server/onboarding/identity';
import { saveOwnerSetupAction, completeOwnerSetupAction } from '@/server/actions/owner-onboarding';
import { OnboardingConflictError } from '@/server/onboarding/repository';

function demoSession(roles: readonly Role[] = ['executive'], overrides: Partial<Actor> = {}): DevIdentity {
  return {
    key: 'owner-demo', label: 'Owner demo', roleSummary: 'Owner', tenantLabel: 'Demo portfolio',
    actor: {
      userId: 'demo-owner-a', tenantId: 'demo-tenant-a', roles, estateIds: [], allEstates: true,
      unitIds: [], vendorOrgId: null, investorProjectIds: [], ...overrides,
    },
  };
}

function clerkSession(metadata: Record<string, unknown> = {}, userId: string | null = 'user_owner_a', otherClaims: Record<string, unknown> = {}) {
  vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_mocked');
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_mocked');
  boundary.auth.mockResolvedValue({ userId, sessionClaims: { metadata, ...otherClaims } });
}

function completeDraft(): OwnerSetupDraft {
  return {
    portfolioType: 'individual_landlord', propertyCount: 'one', tenantCount: 'none',
    rentWorkflow: 'starting', rentPaymentMethods: ['bank_transfer'], priority: 'records', step: 6,
    firstProperty: {
      name: 'Palm Court', address: '14 Example Road', city: 'Lagos', state: 'Lagos',
      country: 'NG', propertyType: 'building', units: 8,
    },
  };
}

function savedRecord(draft: OwnerSetupDraft, version: number, completed = false) {
  return {
    draft, version: version + 1,
    completedAt: completed ? '2026-10-23T12:00:00.000Z' : null,
    updatedAt: '2026-10-23T12:00:00.000Z',
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('CLERK_SECRET_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '');
  vi.stubEnv('REEVE_REQUIRE_MFA', '');
  boundary.getSession.mockResolvedValue(null);
  boundary.auth.mockResolvedValue({ userId: null, sessionClaims: {} });
  boundary.save.mockImplementation(async (_subject: string, draft: OwnerSetupDraft, version: number) => savedRecord(draft, version));
  boundary.complete.mockImplementation(async (_subject: string, draft: OwnerSetupDraft, version: number) => savedRecord(draft, version, true));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('owner onboarding identity boundary', () => {
  it('requires both Clerk configuration values before taking the real-auth path', () => {
    expect(clerkConfigured()).toBe(false);
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_mocked');
    expect(clerkConfigured()).toBe(false);
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_mocked');
    expect(clerkConfigured()).toBe(true);
  });

  it('admits a new authenticated unassigned subject without inventing a tenant Actor', async () => {
    clerkSession();
    const identity = await getOwnerIdentity();
    expect(identity).toEqual({ subject: 'user_owner_a', mode: 'clerk', hasWorkspace: false, onboardingRequired: true, homeRoute: '/workspaces' });
    expect(identity).not.toHaveProperty('actor');
    expect(identity).not.toHaveProperty('tenantId');
    expect(identity).not.toHaveProperty('roles');
    expect(boundary.getSession).not.toHaveBeenCalled();
  });

  it('does not fall back to a demo owner when Clerk is configured but signed out', async () => {
    clerkSession({}, null);
    boundary.getSession.mockResolvedValue(demoSession());
    expect(await getOwnerIdentity()).toBeNull();
    expect(boundary.getSession).not.toHaveBeenCalled();
  });

  it.each(['resident', 'vendor', 'investor', 'security', 'technician', 'platform_admin'])('denies an invited %s with or without tenant metadata', async (role) => {
    for (const tenantId of [undefined, 'tenant-other']) {
      clerkSession({ roles: [role], tenantId });
      expect(await getOwnerIdentity()).toBeNull();
    }
  });

  it.each([['platform_admin', 'executive'], ['estate_manager', 'platform_admin']])('denies a mixed platform-admin account %j', async (...roles) => {
    clerkSession({ roles, tenantId: 'tenant-a', ownerOnboardingRequired: true });
    expect(await getOwnerIdentity()).toBeNull();
  });

  it('does not treat missing roles on an assigned tenant as a new self-registering owner', async () => {
    clerkSession({ tenantId: 'tenant-existing' });
    expect(await getOwnerIdentity()).toBeNull();
  });

  it.each(['executive', 'estate_manager'])('keeps an assigned %s out of mandatory setup unless explicitly required', async (role) => {
    for (const ownerOnboardingRequired of [undefined, false, 'true', 1]) {
      clerkSession({ roles: [role], tenantId: 'tenant-a', ownerOnboardingRequired });
      expect(await getOwnerIdentity()).toMatchObject({ subject: 'user_owner_a', hasWorkspace: true, onboardingRequired: false });
    }
    clerkSession({ roles: [role], tenantId: 'tenant-a', ownerOnboardingRequired: true });
    expect(await getOwnerIdentity()).toMatchObject({ hasWorkspace: true, onboardingRequired: true });
  });

  it('supports the trusted publicMetadata claim while ignoring unsafe client-style metadata', async () => {
    clerkSession({}, 'user_owner_a', { metadata: undefined, publicMetadata: { roles: ['executive'], tenantId: 'tenant-a' } });
    expect(await getOwnerIdentity()).toMatchObject({ hasWorkspace: true, onboardingRequired: false });
    clerkSession({}, 'user_owner_a', { unsafeMetadata: { tenantId: 'tenant-victim', roles: ['platform_admin'] } });
    expect(await getOwnerIdentity()).toMatchObject({ subject: 'user_owner_a', hasWorkspace: false, onboardingRequired: true });
  });

  it('enforces required MFA before allowing setup writes', async () => {
    vi.stubEnv('REEVE_REQUIRE_MFA', '1');
    clerkSession();
    expect(await getOwnerIdentity()).toBeNull();
    clerkSession({}, 'user_owner_a', { amr: ['mfa'] });
    expect(await getOwnerIdentity()).toMatchObject({ subject: 'user_owner_a' });
    clerkSession({}, 'user_owner_a', { amr: ['aal2'] });
    expect(await getOwnerIdentity()).toMatchObject({ subject: 'user_owner_a' });
  });

  it.each(['executive', 'estate_manager'] as const)('permits a local %s demo under its server-derived subject only', async (role) => {
    boundary.getSession.mockResolvedValue(demoSession([role]));
    expect(await getOwnerIdentity()).toEqual({
      subject: 'demo:demo-tenant-a:demo-owner-a', mode: 'local', hasWorkspace: true,
      onboardingRequired: false, homeRoute: '/workspaces',
    });
    expect(boundary.auth).not.toHaveBeenCalled();
  });

  it.each(['resident', 'vendor', 'platform_admin', 'technician'] as const)('does not let a local %s impersonate an owner setup identity', async (role) => {
    boundary.getSession.mockResolvedValue(demoSession([role]));
    expect(await getOwnerIdentity()).toBeNull();
  });

  it('never uses demo identity presets for production registration', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    boundary.getSession.mockResolvedValue(demoSession());
    expect(await getOwnerIdentity()).toBeNull();
    expect(boundary.getSession).not.toHaveBeenCalled();
  });
});

describe('owner setup server-action boundary', () => {
  it('refuses both writes without an authenticated owner before any persistence', async () => {
    expect(await saveOwnerSetupAction(EMPTY_OWNER_SETUP, 0)).toEqual({ ok: false, error: expect.stringContaining('sign in') });
    expect(await completeOwnerSetupAction(completeDraft(), 0)).toEqual({ ok: false, error: expect.stringContaining('sign in') });
    expect(boundary.save).not.toHaveBeenCalled();
    expect(boundary.complete).not.toHaveBeenCalled();
  });

  it('saves a partial validated draft for only the current authenticated subject', async () => {
    clerkSession();
    const draft = structuredClone(EMPTY_OWNER_SETUP);
    draft.portfolioType = 'growing_landlord';
    draft.step = 1;
    expect(await saveOwnerSetupAction(draft, 3)).toEqual({ ok: true, record: savedRecord(draft, 3) });
    expect(boundary.save).toHaveBeenCalledExactlyOnceWith('user_owner_a', draft, 3);
    expect(boundary.complete).not.toHaveBeenCalled();
  });

  it('uses a different server-derived subject after switching authenticated users', async () => {
    clerkSession({}, 'user_owner_a');
    await saveOwnerSetupAction(EMPTY_OWNER_SETUP, 0);
    clerkSession({}, 'user_owner_b');
    await saveOwnerSetupAction(EMPTY_OWNER_SETUP, 0);
    expect(boundary.save.mock.calls.map((call) => call[0])).toEqual(['user_owner_a', 'user_owner_b']);
  });

  it('derives the local subject from its own session, never a caller-provided owner id', async () => {
    boundary.getSession.mockResolvedValue(demoSession(['executive'], { tenantId: 'demo-tenant-b', userId: 'demo-owner-b' }));
    await saveOwnerSetupAction(EMPTY_OWNER_SETUP, 0);
    expect(boundary.save).toHaveBeenCalledExactlyOnceWith('demo:demo-tenant-b:demo-owner-b', EMPTY_OWNER_SETUP, 0);
  });

  it.each([null, undefined, [], 'setup', {}, { ...EMPTY_OWNER_SETUP, step: 8 }, { ...EMPTY_OWNER_SETUP, firstProperty: null }])('rejects malformed action input %j before storage', async (input) => {
    clerkSession();
    expect(await saveOwnerSetupAction(input, 0)).toEqual({ ok: false, error: expect.stringContaining('invalid') });
    expect(boundary.save).not.toHaveBeenCalled();
  });

  it.each(['subject', 'auth_subject', 'ownerUserId', 'tenantId', 'role', 'roles'])('rejects forged top-level %s in draft and completion actions', async (field) => {
    clerkSession();
    const input = { ...completeDraft(), [field]: field === 'roles' ? ['platform_admin'] : 'victim-account' };
    expect(await saveOwnerSetupAction(input, 0)).toMatchObject({ ok: false });
    expect(await completeOwnerSetupAction(input, 0)).toMatchObject({ ok: false });
    expect(boundary.save).not.toHaveBeenCalled();
    expect(boundary.complete).not.toHaveBeenCalled();
  });

  it('rejects nested cross-tenant property fields instead of silently stripping them', async () => {
    clerkSession();
    const draft = completeDraft();
    expect(await saveOwnerSetupAction({ ...draft, firstProperty: { ...draft.firstProperty, tenantId: 'tenant-victim' } }, 0)).toMatchObject({ ok: false });
    expect(boundary.save).not.toHaveBeenCalled();
  });

  it('allows an unanswered payment-method draft but requires a selection before completion', async () => {
    clerkSession();
    const draft = { ...completeDraft(), rentPaymentMethods: [] };
    expect(await saveOwnerSetupAction(draft, 0)).toMatchObject({ ok: true });
    expect(boundary.save).toHaveBeenCalledExactlyOnceWith('user_owner_a', draft, 0);
    const result = await completeOwnerSetupAction(draft, 1);
    expect(result).toMatchObject({ ok: false, errors: { rentPaymentMethods: expect.any(String) } });
    expect(boundary.complete).not.toHaveBeenCalled();
  });

  it('does not guess payment methods when a legacy action payload omits the field', async () => {
    clerkSession();
    const legacy: Record<string, unknown> = { ...completeDraft() };
    delete legacy.rentPaymentMethods;
    expect(await saveOwnerSetupAction(legacy, 0)).toMatchObject({ ok: true, record: { draft: { rentPaymentMethods: [] } } });
    expect(boundary.save).toHaveBeenCalledExactlyOnceWith('user_owner_a', { ...completeDraft(), rentPaymentMethods: [] }, 0);
    expect(await completeOwnerSetupAction(legacy, 1)).toMatchObject({ ok: false, errors: { rentPaymentMethods: expect.any(String) } });
    expect(boundary.complete).not.toHaveBeenCalled();
  });

  it.each([
    ['not_a_payment_method'], ['bank_transfer', 'not_a_payment_method'],
    ['bank_transfer', 'bank_transfer'], ['cash_manual', 'cash_manual'],
  ])('rejects unknown or duplicate payment methods %j before saving or completing', async (...rentPaymentMethods) => {
    clerkSession();
    const draft = { ...completeDraft(), rentPaymentMethods };
    expect(await saveOwnerSetupAction(draft, 0)).toMatchObject({ ok: false, error: expect.stringContaining('invalid') });
    expect(await completeOwnerSetupAction(draft, 0)).toMatchObject({ ok: false, error: expect.stringContaining('invalid') });
    expect(boundary.save).not.toHaveBeenCalled();
    expect(boundary.complete).not.toHaveBeenCalled();
  });

  it('preserves multiple validated payment selections while retaining the existing rent-workflow requirement', async () => {
    clerkSession();
    const draft: OwnerSetupDraft = { ...completeDraft(), rentPaymentMethods: ['bank_transfer', 'cash_manual'] };
    expect(await completeOwnerSetupAction(draft, 2)).toMatchObject({ ok: true, record: { draft: { rentPaymentMethods: ['bank_transfer', 'cash_manual'] } } });
    expect(boundary.complete).toHaveBeenCalledExactlyOnceWith('user_owner_a', draft, 2);
    boundary.complete.mockClear();
    expect(await completeOwnerSetupAction({ ...draft, rentWorkflow: '' }, 2)).toMatchObject({ ok: false, errors: { rentWorkflow: expect.any(String) } });
    expect(boundary.complete).not.toHaveBeenCalled();
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER, 2_147_483_647, '0', undefined])('rejects invalid version %j before storage', async (version) => {
    clerkSession();
    expect(await saveOwnerSetupAction(EMPTY_OWNER_SETUP, version as number)).toMatchObject({ ok: false, error: expect.stringContaining('invalid') });
    expect(await completeOwnerSetupAction(completeDraft(), version as number)).toMatchObject({ ok: false, error: expect.stringContaining('invalid') });
    expect(boundary.save).not.toHaveBeenCalled();
    expect(boundary.complete).not.toHaveBeenCalled();
  });

  it('validates all seven steps on completion even when the caller claims to be on the final step', async () => {
    clerkSession();
    const result = await completeOwnerSetupAction({ ...EMPTY_OWNER_SETUP, step: 6 }, 0);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('all seven steps') });
    if (!result.ok) {
      for (const field of ['portfolioType', 'propertyCount', 'tenantCount', 'rentWorkflow', 'rentPaymentMethods', 'priority', 'firstProperty.name']) {
        expect(result.errors).toHaveProperty(field);
      }
    }
    expect(boundary.complete).not.toHaveBeenCalled();
  });

  it('completes only valid setup using the authenticated subject and expected version', async () => {
    clerkSession();
    const draft = completeDraft();
    expect(await completeOwnerSetupAction(draft, 4)).toEqual({ ok: true, record: savedRecord(draft, 4, true) });
    expect(boundary.complete).toHaveBeenCalledExactlyOnceWith('user_owner_a', draft, 4);
    expect(boundary.save).not.toHaveBeenCalled();
  });

  it('returns a safe conflict message without exposing storage internals', async () => {
    clerkSession();
    boundary.save.mockRejectedValue(new OnboardingConflictError());
    const result = await saveOwnerSetupAction(EMPTY_OWNER_SETUP, 1);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('another tab') });
  });

  it('does not leak database failures, property addresses, or auth subjects to the browser', async () => {
    clerkSession();
    const internal = new Error('postgres://password@private-db user_owner_a 14 Example Road tenant-victim');
    boundary.save.mockRejectedValue(internal);
    boundary.complete.mockRejectedValue(internal);
    const results = [await saveOwnerSetupAction(EMPTY_OWNER_SETUP, 0), await completeOwnerSetupAction(completeDraft(), 0)];
    for (const result of results) {
      expect(result).toMatchObject({ ok: false, error: expect.stringContaining('could not save') });
      expect(JSON.stringify(result)).not.toMatch(/password|private-db|user_owner_a|Example Road|tenant-victim/);
    }
  });
});

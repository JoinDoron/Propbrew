import { beforeEach, describe, expect, it, vi } from 'vitest';
import { can, type Actor, type Role } from '@/lib/authz';
import type { DevIdentity } from '@/server/identities';
import type { OwnerIdentity } from '@/server/onboarding/identity';
import type { OwnerSetupRecord } from '@/server/onboarding/repository';
import { EMPTY_OWNER_SETUP } from '@/domain/owner-onboarding';

const boundary = vi.hoisted(() => ({
  getSession: vi.fn(),
  getOwnerIdentity: vi.fn(),
  getOwnerSetup: vi.fn(),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock('next/navigation', () => ({ redirect: boundary.redirect, notFound: boundary.notFound }));
vi.mock('@/server/session', () => ({ getSession: boundary.getSession }));
vi.mock('@/server/onboarding/identity', () => ({ getOwnerIdentity: boundary.getOwnerIdentity }));
vi.mock('@/server/onboarding/repository', () => ({ getOwnerSetup: boundary.getOwnerSetup }));

import { requireOperatorSession, requireWorkspace } from '@/server/workspaces';

function session(roles: readonly Role[] = ['estate_manager'], overrides: Partial<Actor> = {}, key = 'operator-demo'): DevIdentity {
  return {
    key, label: 'Operator demo', roleSummary: roles.join(' · '), tenantLabel: 'Portfolio A',
    actor: {
      userId: 'operator-a', tenantId: 'tenant-a', roles,
      estateIds: ['estate-a'], allEstates: false, unitIds: ['unit-a'],
      vendorOrgId: 'vendor-a', investorProjectIds: ['project-a'], ...overrides,
    },
  };
}

function owner(overrides: Partial<OwnerIdentity> = {}): OwnerIdentity {
  return {
    subject: 'owner-a', mode: 'clerk', hasWorkspace: true,
    onboardingRequired: false, homeRoute: '/workspaces', ...overrides,
  };
}

function setup(overrides: Partial<OwnerSetupRecord> = {}): OwnerSetupRecord {
  return {
    draft: structuredClone(EMPTY_OWNER_SETUP), version: 0,
    completedAt: null, updatedAt: null, ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  boundary.getSession.mockResolvedValue(null);
  boundary.getOwnerIdentity.mockResolvedValue(null);
  boundary.getOwnerSetup.mockResolvedValue(setup());
  // Next's redirect/notFound terminate rendering by throwing. A returning mock
  // would falsely allow the guard to continue into protected application code.
  boundary.redirect.mockImplementation((href: string): never => { throw new Error(`redirect:${href}`); });
  boundary.notFound.mockImplementation((): never => { throw new Error('not-found'); });
});

describe('operator workspace session boundary', () => {
  it('redirects a signed-out visitor to login before reading setup records', async () => {
    await expect(requireOperatorSession()).rejects.toThrow('redirect:/login');
    expect(boundary.redirect).toHaveBeenCalledExactlyOnceWith('/login');
    expect(boundary.getOwnerIdentity).toHaveBeenCalledOnce();
    expect(boundary.getOwnerSetup).not.toHaveBeenCalled();
    expect(boundary.notFound).not.toHaveBeenCalled();
  });

  it('routes a verified owner without an assigned tenant to onboarding, not an operator portal', async () => {
    boundary.getOwnerIdentity.mockResolvedValue(owner({ hasWorkspace: false, onboardingRequired: true }));
    await expect(requireOperatorSession()).rejects.toThrow('redirect:/onboarding');
    expect(boundary.redirect).toHaveBeenCalledExactlyOnceWith('/onboarding');
    expect(boundary.getOwnerSetup).not.toHaveBeenCalled();
    expect(boundary.notFound).not.toHaveBeenCalled();
  });

  it.each([
    ['resident', '/portal'],
    ['vendor', '/portal/jobs'],
    ['investor', '/portal/projects'],
    ['platform_admin', '/admin/tenants'],
  ] as const)('keeps %s in its own authenticated shell', async (role, home) => {
    boundary.getSession.mockResolvedValue(session([role], role === 'platform_admin' ? { tenantId: null } : {}));
    await expect(requireOperatorSession()).rejects.toThrow(`redirect:${home}`);
    expect(boundary.redirect).toHaveBeenCalledExactlyOnceWith(home);
    expect(boundary.getOwnerIdentity).not.toHaveBeenCalled();
    expect(boundary.getOwnerSetup).not.toHaveBeenCalled();
  });

  it('keeps mixed platform-administrator and operator roles in the platform shell', async () => {
    boundary.getSession.mockResolvedValue(session(['platform_admin', 'estate_manager']));
    await expect(requireOperatorSession()).rejects.toThrow('redirect:/admin/tenants');
    expect(boundary.getOwnerIdentity).not.toHaveBeenCalled();
    expect(boundary.getOwnerSetup).not.toHaveBeenCalled();
  });

  it.each(['executive', 'estate_manager', 'facility_manager', 'technician', 'security'] as const)
    ('returns the same local %s session without applying real-owner onboarding requirements', async (role) => {
      const current = session([role]);
      boundary.getSession.mockResolvedValue(current);
      await expect(requireOperatorSession()).resolves.toBe(current);
      expect(boundary.getOwnerIdentity).not.toHaveBeenCalled();
      expect(boundary.getOwnerSetup).not.toHaveBeenCalled();
      expect(boundary.redirect).not.toHaveBeenCalled();
    });

  it.each(['executive', 'estate_manager'] as const)
    ('admits an existing Clerk %s with optional, untouched setup', async (role) => {
      const current = session([role], {}, 'clerk');
      boundary.getSession.mockResolvedValue(current);
      boundary.getOwnerIdentity.mockResolvedValue(owner());
      await expect(requireOperatorSession()).resolves.toBe(current);
      expect(boundary.getOwnerSetup).toHaveBeenCalledExactlyOnceWith('owner-a');
      expect(boundary.redirect).not.toHaveBeenCalled();
    });

  it.each(['executive', 'estate_manager'] as const)
    ('requires incomplete setup when the Clerk %s has an explicit requirement', async (role) => {
      boundary.getSession.mockResolvedValue(session([role], {}, 'clerk'));
      boundary.getOwnerIdentity.mockResolvedValue(owner({ onboardingRequired: true }));
      await expect(requireOperatorSession()).rejects.toThrow('redirect:/onboarding');
      expect(boundary.getOwnerSetup).toHaveBeenCalledExactlyOnceWith('owner-a');
      expect(boundary.redirect).toHaveBeenCalledExactlyOnceWith('/onboarding');
    });

  it('resumes a saved incomplete owner setup even when it began as optional', async () => {
    boundary.getSession.mockResolvedValue(session(['executive'], {}, 'clerk'));
    boundary.getOwnerIdentity.mockResolvedValue(owner());
    boundary.getOwnerSetup.mockResolvedValue(setup({ version: 3 }));
    await expect(requireOperatorSession()).rejects.toThrow('redirect:/onboarding');
    expect(boundary.getOwnerSetup).toHaveBeenCalledExactlyOnceWith('owner-a');
    expect(boundary.redirect).toHaveBeenCalledExactlyOnceWith('/onboarding');
  });

  it.each([false, true])('admits a completed owner setup despite required=%s', async (onboardingRequired) => {
    const current = session(['estate_manager'], {}, 'clerk');
    boundary.getSession.mockResolvedValue(current);
    boundary.getOwnerIdentity.mockResolvedValue(owner({ onboardingRequired }));
    boundary.getOwnerSetup.mockResolvedValue(setup({ version: 4, completedAt: '2026-10-23T12:00:00.000Z' }));
    await expect(requireOperatorSession()).resolves.toBe(current);
    expect(boundary.redirect).not.toHaveBeenCalled();
  });

  it('does not invent an owner setup identity for a Clerk operator', async () => {
    const current = session(['estate_manager'], {}, 'clerk');
    boundary.getSession.mockResolvedValue(current);
    await expect(requireOperatorSession()).resolves.toBe(current);
    expect(boundary.getOwnerIdentity).toHaveBeenCalledOnce();
    expect(boundary.getOwnerSetup).not.toHaveBeenCalled();
  });

  it('does not apply the owner-only onboarding flow to an invited Clerk facility manager', async () => {
    const current = session(['facility_manager'], {}, 'clerk');
    boundary.getSession.mockResolvedValue(current);
    await expect(requireOperatorSession()).resolves.toBe(current);
    expect(boundary.getOwnerIdentity).not.toHaveBeenCalled();
    expect(boundary.getOwnerSetup).not.toHaveBeenCalled();
  });
});

describe('server-enforced workspace entry', () => {
  it('requires login before considering a requested module', async () => {
    await expect(requireWorkspace('estate')).rejects.toThrow('redirect:/login');
    expect(boundary.redirect).toHaveBeenCalledExactlyOnceWith('/login');
    expect(boundary.notFound).not.toHaveBeenCalled();
  });

  it('cannot bypass pending owner onboarding by naming an allowed module', async () => {
    boundary.getSession.mockResolvedValue(session(['estate_manager'], {}, 'clerk'));
    boundary.getOwnerIdentity.mockResolvedValue(owner({ onboardingRequired: true }));
    await expect(requireWorkspace('shortlet')).rejects.toThrow('redirect:/onboarding');
    expect(boundary.redirect).toHaveBeenCalledExactlyOnceWith('/onboarding');
    expect(boundary.notFound).not.toHaveBeenCalled();
  });

  it('denies security access to Shortlet despite its shared bookings read capability', async () => {
    const current = session(['security']);
    expect(can(current.actor, 'bookings_amenities', 'read').allowed).toBe(true);
    boundary.getSession.mockResolvedValue(current);
    await expect(requireWorkspace('shortlet')).rejects.toThrow('not-found');
    expect(boundary.notFound).toHaveBeenCalledExactlyOnceWith();
    expect(boundary.redirect).not.toHaveBeenCalled();
  });

  it('denies technician access to Construction rather than treating another module as permission', async () => {
    boundary.getSession.mockResolvedValue(session(['technician']));
    await expect(requireWorkspace('construction')).rejects.toThrow('not-found');
    expect(boundary.notFound).toHaveBeenCalledExactlyOnceWith();
    expect(boundary.redirect).not.toHaveBeenCalled();
  });

  it('denies an otherwise eligible operator when its session has no tenant context', async () => {
    boundary.getSession.mockResolvedValue(session(['estate_manager'], { tenantId: null }));
    await expect(requireWorkspace('estate')).rejects.toThrow('not-found');
    expect(boundary.notFound).toHaveBeenCalledExactlyOnceWith();
    expect(boundary.redirect).not.toHaveBeenCalled();
  });

  it('admits a technician into Facility without changing its assignment-limited grant', async () => {
    const current = session(['technician']);
    Object.freeze(current.actor.roles);
    Object.freeze(current.actor.estateIds);
    Object.freeze(current.actor.unitIds);
    Object.freeze(current.actor.investorProjectIds);
    Object.freeze(current.actor);
    Object.freeze(current);
    const original = structuredClone(current);
    const workOrderGrant = can(current.actor, 'work_orders', 'read');
    boundary.getSession.mockResolvedValue(current);

    await expect(requireWorkspace('facility')).resolves.toBe(current);
    await expect(requireWorkspace('construction')).rejects.toThrow('not-found');
    expect(current).toEqual(original);
    expect(can(current.actor, 'work_orders', 'read')).toEqual(workOrderGrant);
    if (!workOrderGrant.allowed) throw new Error('Technician work-order grant must remain available.');
    expect(workOrderGrant.scope).toEqual({
      tenantId: 'tenant-a', estateIds: ['estate-a'],
      ownership: [{ key: 'assigned_to_me', userId: 'operator-a' }],
    });
  });

  it('returns the same manager session across each permitted portal, not a synthesized module identity', async () => {
    const current = session(['estate_manager', 'resident']);
    const original = structuredClone(current);
    boundary.getSession.mockResolvedValue(current);
    for (const workspace of ['estate', 'facility', 'shortlet', 'construction'] as const) {
      await expect(requireWorkspace(workspace)).resolves.toBe(current);
    }
    expect(current).toEqual(original);
    expect(boundary.redirect).not.toHaveBeenCalled();
    expect(boundary.notFound).not.toHaveBeenCalled();
    expect(boundary.getOwnerSetup).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor } from '@/lib/authz';
import { actorForCompanyMember } from '@/lib/auth/company-policy';

const mocks = vi.hoisted(() => ({
  actor: {} as Actor,
  db: { users: [{ id: 'target-user', tenantId: 'company-lagos', status: 'active' }] },
}));
vi.mock('@/server/session', () => ({ getActor: async () => mocks.actor }));
vi.mock('@/server/data/store', () => ({ db: mocks.db }));
vi.mock('@/server/data/durable-records', () => ({ withDurableMutation: async (fn: () => Promise<unknown>) => fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { setUserStatus } from '@/server/actions/admin-users';

function legacyActor(roles: Actor['roles']): Actor {
  return {
    userId: 'acting-user', tenantId: 'company-lagos', roles, estateIds: [], allEstates: true,
    unitIds: [], vendorOrgId: null, investorProjectIds: [],
  };
}

beforeEach(() => {
  mocks.db.users[0].status = 'active';
  mocks.actor = legacyActor(['estate_manager']);
});

describe('platform user administration remains outside company roles', () => {
  it.each(['estate_manager', 'facility_manager'] as const)('denies %s despite its operational users_roles manage grant', async (role) => {
    mocks.actor = legacyActor([role]);
    expect(await setUserStatus('target-user', 'suspended')).toMatchObject({ ok: false });
    expect(mocks.db.users[0].status).toBe('active');
  });

  it('denies a company owner, including a malformed injected platform role', async () => {
    const actor = actorForCompanyMember({
      membershipId: 'owner-membership', companyId: 'company-lagos', userId: 'acting-user',
      companyRole: 'owner', status: 'active', companyStatus: 'active', estateIds: [], allEstates: true,
    }, 'acting-user')!;
    for (const identity of [actor, { ...actor, roles: ['platform_admin'] } as Actor]) {
      mocks.actor = identity;
      expect(await setUserStatus('target-user', 'suspended')).toMatchObject({ ok: false });
      expect(mocks.db.users[0].status).toBe('active');
    }
  });

  it('allows an existing verified platform operator and validates the status at runtime', async () => {
    mocks.actor = legacyActor(['platform_admin']);
    expect(await setUserStatus('target-user', 'deleted' as never)).toMatchObject({ ok: false });
    expect(mocks.db.users[0].status).toBe('active');
    expect(await setUserStatus('target-user', 'suspended')).toEqual({ ok: true, status: 'suspended' });
    expect(mocks.db.users[0].status).toBe('suspended');
  });
});

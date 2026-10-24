import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember } from '@/lib/auth/company-policy';
import { demoAccountsEnabled, isDemoAccount, assertNotDemoAccount, assertDemoCompany } from '@/server/auth/demo-config';
import { withDurableMutation } from '@/server/data/durable-records';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import type { CompanyPrincipal, NativeIdentity } from '@/server/auth/company';
import { activateCompany, provisionCompany } from '@/server/auth/company';

const database = vi.hoisted(() => ({ withAuthTransaction: vi.fn(), authDatabasePool: vi.fn() }));
vi.mock('@/server/auth/database', () => database);
vi.mock('next/headers', () => ({ headers: async () => new Headers(), cookies: vi.fn() }));

const DEMO_COMPANY = '6b20d921-50a1-4ccb-9018-d6f80204e223';
const DEMO_USERS = [
  '8fd60a0b-3fd5-4301-8f01-8c42c2e34d01',
  '8fd60a0b-3fd5-4301-8f01-8c42c2e34d02',
  '8fd60a0b-3fd5-4301-8f01-8c42c2e34d03',
  '8fd60a0b-3fd5-4301-8f01-8c42c2e34d04',
];
const REAL_USER = '973b03a6-6898-444c-94a2-c080237b6e42';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('PROPBREW_AUTH_MODE', 'company');
  vi.stubEnv('DATA_SOURCE', 'postgres');
  vi.stubEnv('PROPBREW_DEMO_ACCOUNTS', '1');
  vi.stubEnv('PROPBREW_DEMO_PASSWORD', 'temporary-server-only-demo-password-32-plus');
});
afterEach(() => vi.unstubAllEnvs());

function identity(userId: string): NativeIdentity {
  return { user: { id: userId, name: 'Disposable demo visitor', email: 'demo@example.invalid' }, session: { id: '5b449d4d-5dc3-45f6-8a5c-1b537df3a4ab', activeCompanyId: DEMO_COMPANY } };
}

/** Deliberately overgrant the fixture to prove that demo protection is an
 * independent ceiling, rather than depending on a correctly seeded role. */
function principal(userId: string): CompanyPrincipal {
  const membership = {
    membershipId: 'b34db835-3f5d-420b-bc84-03e8b4020878', userId, companyId: DEMO_COMPANY,
    companyRole: 'owner' as const, modules: { estate: 'manage' as const, facility: 'manage' as const, shortlet: 'manage' as const, construction: 'manage' as const },
    estateIds: [], allEstates: true, status: 'active' as const, companyStatus: 'active' as const,
  };
  return { ...identity(userId), actor: actorForCompanyMember(membership, userId)!, company: { id: DEMO_COMPANY, name: 'Isolated demonstration' }, membership: { ...membership, version: '1' } };
}

function sampleState(): WorkspaceRecordState {
  return { schemaVersion: 1, collections: { notices: [{ read: false }] }, history: {}, auxiliary: {}, sequences: {} };
}

describe('public demo account activation', () => {
  it('requires native company authentication, an explicit switch and a server credential', () => {
    expect(demoAccountsEnabled()).toBe(true);
    vi.stubEnv('PROPBREW_DEMO_ACCOUNTS', '0'); expect(demoAccountsEnabled()).toBe(false);
    vi.stubEnv('PROPBREW_DEMO_ACCOUNTS', 'true'); expect(demoAccountsEnabled()).toBe(false);
    vi.stubEnv('PROPBREW_DEMO_ACCOUNTS', '1'); vi.stubEnv('PROPBREW_AUTH_MODE', ''); expect(demoAccountsEnabled()).toBe(false);
    vi.stubEnv('PROPBREW_AUTH_MODE', 'company'); vi.stubEnv('PROPBREW_DEMO_PASSWORD', ''); expect(demoAccountsEnabled()).toBe(false);
  });

  it.each([31, 32, 128, 129])('bounds server credentials at %i characters', (length) => {
    vi.stubEnv('PROPBREW_DEMO_PASSWORD', 'd'.repeat(length));
    expect(demoAccountsEnabled()).toBe(length >= 32 && length <= 128);
  });

  it('recognises only the four reserved authenticated identities, even when demo entry is disabled', () => {
    vi.stubEnv('PROPBREW_DEMO_ACCOUNTS', '0');
    for (const userId of DEMO_USERS) expect(isDemoAccount(userId)).toBe(true);
    for (const userId of [REAL_USER, '', 'demo@example.invalid', DEMO_USERS[0] + '-suffix', DEMO_USERS[0].slice(0, -1) + '5']) expect(isDemoAccount(userId)).toBe(false);
  });

  it('protects reserved demo identities independently of the entry switch', () => {
    vi.stubEnv('PROPBREW_DEMO_ACCOUNTS', '0');
    for (const userId of DEMO_USERS) expect(() => assertNotDemoAccount(userId)).toThrow(/demo|view.only/i);
    expect(() => assertNotDemoAccount(REAL_USER)).not.toThrow();
  });
});

describe('demo account company boundaries', () => {
  it('binds every demo identity to the one reserved sample company', () => {
    for (const userId of DEMO_USERS) {
      expect(() => assertDemoCompany(userId, DEMO_COMPANY)).not.toThrow();
      expect(() => assertDemoCompany(userId, 'c0672c9a-439a-44ef-a3e5-a3078b34fd26')).toThrow(/demo|unavailable/i);
    }
  });

  it('never admits a real account to the reserved demo company', () => {
    expect(() => assertDemoCompany(REAL_USER, DEMO_COMPANY)).toThrow(/demo|unavailable/i);
    expect(() => assertDemoCompany(REAL_USER, 'c0672c9a-439a-44ef-a3e5-a3078b34fd26')).not.toThrow();
  });

  it('closes even the reserved company to existing demo identities when entry is disabled', () => {
    vi.stubEnv('PROPBREW_DEMO_ACCOUNTS', '0');
    for (const userId of DEMO_USERS) expect(() => assertDemoCompany(userId, DEMO_COMPANY)).toThrow(/demo|unavailable/i);
  });

  it.each(DEMO_USERS)('refuses company creation for reserved account %s before touching the database', async (userId) => {
    await expect(provisionCompany(identity(userId), 'Attempted demo company')).rejects.toThrow(/demo|view.only/i);
    expect(database.withAuthTransaction).not.toHaveBeenCalled();
  });

  it('refuses switching a demo identity into a real company before touching the database', async () => {
    await expect(activateCompany(identity(DEMO_USERS[0]), 'c0672c9a-439a-44ef-a3e5-a3078b34fd26')).rejects.toThrow(/demo|unavailable|view.only/i);
    expect(database.withAuthTransaction).not.toHaveBeenCalled();
  });
});

describe('demo workspace write isolation', () => {
  it.each(DEMO_USERS)('rejects nested demo mutations even with incorrectly broad stored grants: %s', async (userId) => {
    const state = sampleState(), before = structuredClone(state), work = vi.fn(async () => { state.auxiliary.changed = true; });
    await expect(runWithRecordContext({ state, domainTenantId: DEMO_COMPANY, mode: 'write', companyPrincipal: principal(userId) }, () => withDurableMutation(work, 'estate', 'update'))).rejects.toThrow(/demo|view.only/i);
    expect(work).not.toHaveBeenCalled(); expect(state).toEqual(before);
  });

  it('does not permit inbox/read-marker writes through a read action', async () => {
    const state = sampleState(), before = structuredClone(state), work = vi.fn(async () => { state.auxiliary.readBySomeone = true; });
    await expect(runWithRecordContext({ state, domainTenantId: DEMO_COMPANY, mode: 'write', companyPrincipal: principal(DEMO_USERS[0]) }, () => withDurableMutation(work, ['estate', 'facility', 'shortlet', 'construction'], 'read'))).rejects.toThrow(/demo|view.only/i);
    expect(work).not.toHaveBeenCalled(); expect(state).toEqual(before);
  });

  it('keeps demo write protection after the public-entry switch is turned off', async () => {
    vi.stubEnv('PROPBREW_DEMO_ACCOUNTS', '0');
    const state = sampleState(), work = vi.fn(async () => undefined);
    await expect(runWithRecordContext({ state, domainTenantId: DEMO_COMPANY, mode: 'write', companyPrincipal: principal(DEMO_USERS[0]) }, () => withDurableMutation(work, 'construction', 'read'))).rejects.toThrow(/demo|view.only/i);
    expect(work).not.toHaveBeenCalled();
  });

  it('preserves a normal company member’s permitted personal read-marker update', async () => {
    const state = sampleState();
    const result = await runWithRecordContext({ state, domainTenantId: DEMO_COMPANY, mode: 'write', companyPrincipal: principal(REAL_USER) }, () => withDurableMutation(async () => { state.auxiliary.normalUserRead = true; return 'saved'; }, 'estate', 'read'));
    expect(result).toBe('saved'); expect(state.auxiliary.normalUserRead).toBe(true);
  });
});

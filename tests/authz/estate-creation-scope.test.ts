import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Actor, Role } from '@/lib/authz';
import { MATRIX } from '@/lib/authz';
import { db } from '@/server/data/store';
import { identityByKey, SEED } from '@/server/identities';
import { canRegisterEstateRecords, withCreatedEstateAssignments } from '@/server/data/estate-creation-scope';

const boundary = vi.hoisted(() => ({ cookies: vi.fn(), auth: vi.fn(), identity: 'estate_manager', signedOut: false }));
vi.mock('next/headers', () => ({ cookies: boundary.cookies }));
vi.mock('@clerk/nextjs/server', () => ({ auth: boundary.auth }));
import { getSession } from '@/server/session';

const initialStore = structuredClone(db);
const createdSite = 'estate-created-scope-test';

function actor(roles: readonly Role[] = ['estate_manager'], overrides: Partial<Actor> = {}): Actor {
  return { ...identityByKey('estate_manager').actor, roles, ...overrides };
}

function addTrustedProperty(person = actor()) {
  const tenantId = person.tenantId!;
  db.sites.push({ ...db.sites[0], id: createdSite as never, tenantId: tenantId as never, name: 'Created demo property' });
  db.estateCreatorAssignments.push({ tenantId, userId: person.userId, siteId: createdSite, source: 'estate_property_registration', createdAt: '2026-10-23T12:00:00Z' });
  db.estateRegistrationReceipts.push({ tenantId, actorId: person.userId, key: '11111111-1111-4111-8111-111111111111', kind: 'property', payloadHash: 'trusted-payload-hash', result: { id: createdSite, name: 'Created demo property' }, createdAt: '2026-10-23T12:00:00Z' });
}

beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(db, structuredClone(initialStore));
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DATA_SOURCE', '');
  vi.stubEnv('CLERK_SECRET_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', '');
  vi.stubEnv('NEXT_PUBLIC_DEV_IDENTITY', '1');
  vi.stubEnv('REEVE_REQUIRE_MFA', '');
  boundary.identity = 'estate_manager';
  boundary.signedOut = false;
  boundary.cookies.mockResolvedValue({ get: (name: string) => name === 'vesta_dev_identity' ? { value: boundary.identity } : name === 'vesta_signed_out' && boundary.signedOut ? { value: '1' } : undefined });
});

afterEach(() => {
  Object.assign(db, structuredClone(initialStore));
  vi.unstubAllEnvs();
});

describe('trusted creator property assignments', () => {
  it.each(['executive', 'facility_manager', 'technician', 'security', 'resident', 'vendor', 'investor', 'platform_admin'] as const)
    ('never grants registration to %s merely because it can read another part of Estate', (role) => {
      expect(canRegisterEstateRecords(actor([role]))).toBe(false);
    });

  it('permits an estate manager using its existing create grant without changing the permissions matrix', () => {
    const matrix = JSON.stringify(MATRIX);
    expect(canRegisterEstateRecords(actor())).toBe(true);
    expect(canRegisterEstateRecords(actor(['estate_manager', 'resident']))).toBe(true);
    expect(canRegisterEstateRecords(actor(['estate_manager', 'platform_admin']))).toBe(false);
    expect(JSON.stringify(MATRIX)).toBe(matrix);
  });

  it.each([null, '', '   '])('fails closed for missing tenant context (%s)', (tenantId) => {
    const person = actor(['estate_manager'], { tenantId });
    expect(canRegisterEstateRecords(person)).toBe(false);
    expect(withCreatedEstateAssignments(person).estateIds).toEqual(person.estateIds);
  });

  it('adds only a same-user, same-tenant property backed by a server receipt', () => {
    const person = actor();
    addTrustedProperty(person);
    expect(withCreatedEstateAssignments(person).estateIds).toEqual([SEED.estateGardens, createdSite]);
    expect(withCreatedEstateAssignments(actor(['estate_manager'], { userId: 'another-manager' })).estateIds).toEqual([SEED.estateGardens]);
    expect(withCreatedEstateAssignments(actor(['estate_manager'], { tenantId: SEED.tenantB, estateIds: [SEED.estateIkoyi] })).estateIds).toEqual([SEED.estateIkoyi]);
  });

  it('does not treat an unbacked assignment to an existing unassigned estate as a creation grant', () => {
    const person = actor();
    db.estateCreatorAssignments.push({ tenantId: SEED.tenantA, userId: person.userId, siteId: SEED.estateVictoria, source: 'estate_property_registration', createdAt: '2026-10-23T12:00:00Z' });
    expect(withCreatedEstateAssignments(person).estateIds).toEqual([SEED.estateGardens]);
  });

  it.each(['missing-site', 'wrong-site-tenant', 'facility-site', 'missing-receipt', 'wrong-receipt-user', 'wrong-receipt-tenant', 'wrong-receipt-kind'])
    ('rejects a creator assignment with %s provenance', (kind) => {
      const person = actor();
      addTrustedProperty(person);
      const property = db.sites.find((site) => site.id === createdSite)!;
      const receipt = db.estateRegistrationReceipts[0];
      if (kind === 'missing-site') db.sites = db.sites.filter((site) => site.id !== createdSite);
      if (kind === 'wrong-site-tenant') Object.assign(property, { tenantId: SEED.tenantB });
      if (kind === 'facility-site') property.kind = 'facility';
      if (kind === 'missing-receipt') db.estateRegistrationReceipts = [];
      if (kind === 'wrong-receipt-user') receipt.actorId = 'other-manager';
      if (kind === 'wrong-receipt-tenant') receipt.tenantId = SEED.tenantB;
      if (kind === 'wrong-receipt-kind') receipt.kind = 'tenant';
      expect(withCreatedEstateAssignments(person).estateIds).toEqual([SEED.estateGardens]);
    });

  it('clones and deduplicates estate IDs without mutating roles, tenant or preset assignments', () => {
    const person = actor();
    addTrustedProperty(person);
    db.estateCreatorAssignments.push({ ...db.estateCreatorAssignments[0] });
    Object.freeze(person.estateIds);
    Object.freeze(person.roles);
    Object.freeze(person);
    const result = withCreatedEstateAssignments(person);
    expect(result).not.toBe(person);
    expect(person.estateIds).toEqual([SEED.estateGardens]);
    expect(result.estateIds).toEqual([SEED.estateGardens, createdSite]);
    expect(result.roles).toBe(person.roles);
    expect(result.tenantId).toBe(person.tenantId);
    expect(result.allEstates).toBe(person.allEstates);
    expect(identityByKey('estate_manager').actor.estateIds).toEqual([SEED.estateGardens]);
  });

  it('removes creator-only scope when an estate-manager grant is no longer held', () => {
    addTrustedProperty();
    expect(withCreatedEstateAssignments(actor(['security'])).estateIds).toEqual([SEED.estateGardens]);
  });
});

describe('demo session creation-scope hook', () => {
  it('returns the trusted creator scope on later demo requests without changing the identity preset', async () => {
    addTrustedProperty();
    const session = await getSession();
    expect(session?.actor.estateIds).toEqual([SEED.estateGardens, createdSite]);
    expect(session?.key).toBe('estate_manager');
    expect(identityByKey('estate_manager').actor.estateIds).toEqual([SEED.estateGardens]);
  });

  it('does not transfer creator scope when another demo user signs in', async () => {
    addTrustedProperty();
    boundary.identity = 'facility_manager';
    expect((await getSession())?.actor.estateIds).toEqual([SEED.estateGardens, SEED.estateVictoria]);
  });

  it('does not add memory assignments to a real Clerk session, even with matching subject and tenant', async () => {
    const person = actor();
    addTrustedProperty(person);
    vi.stubEnv('CLERK_SECRET_KEY', 'sk_test_scope');
    vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'pk_test_scope');
    boundary.auth.mockResolvedValue({ userId: person.userId, sessionClaims: { metadata: { roles: ['estate_manager'], tenantId: SEED.tenantA, estateIds: [SEED.estateGardens] } } });
    const session = await getSession();
    expect(session?.key).toBe('clerk');
    expect(session?.actor.estateIds).toEqual([SEED.estateGardens]);
  });

  it('keeps an explicitly enabled production demo isolated from runtime creation assignments', async () => {
    addTrustedProperty();
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('REEVE_ALLOW_IN_MEMORY_DATA', '1');
    vi.stubEnv('REEVE_ALLOW_DEMO_IDENTITIES', '1');
    expect((await getSession())?.actor.estateIds).toEqual([SEED.estateGardens]);
    expect(withCreatedEstateAssignments(actor()).estateIds).toEqual([SEED.estateGardens]);
  });

  it('does not apply a memory assignment to the HTTP-backed environment', async () => {
    addTrustedProperty();
    vi.stubEnv('DATA_SOURCE', 'http');
    expect((await getSession())?.actor.estateIds).toEqual([SEED.estateGardens]);
    expect(withCreatedEstateAssignments(actor()).estateIds).toEqual([SEED.estateGardens]);
  });

  it('does not turn a signed-out visitor or disabled demo into a creator session', async () => {
    addTrustedProperty();
    boundary.signedOut = true;
    expect(await getSession()).toBeNull();
    boundary.signedOut = false;
    vi.stubEnv('NEXT_PUBLIC_DEV_IDENTITY', '0');
    expect(await getSession()).toBeNull();
  });
});

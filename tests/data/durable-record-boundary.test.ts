import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withDurableMutation, withDurableRead } from '@/server/data/durable-records';
import { currentRecordContext, getRecordAuxiliary, nextRecordSequence, runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { db, getHistory, initialWorkspaceRecordState, recordHistory } from '@/server/data/store';
import { getActor } from '@/server/session';
import { issueReviewSession, REVIEW_SESSION_COOKIE } from '@/server/review-auth';
import { SEED } from '@/server/identities';

const backend = vi.hoisted(() => ({
  cookies: new Map<string, string>(),
  records: new Map<string, { domain: string; payload: unknown }>(),
  repository: vi.fn(),
  unavailable: false,
  failCommit: false,
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => backend.cookies.has(key) ? { value: backend.cookies.get(key)! } : undefined }) }));
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`REDIRECT:${href}`); } }));
vi.mock('@/server/data/workspace-postgres', () => ({ withWorkspaceState: backend.repository }));

const canonical = '12345678-1234-4234-8234-123456789abc';
const secondCanonical = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const reviewer = 'propbrew-private-review-estate-manager';
const domain = SEED.tenantA;
type Result = { value: unknown; payload?: unknown; commit?: boolean };
async function repository(tenant: string, logical: string, mode: 'read' | 'write', initialize: () => unknown, fn: (payload: unknown) => Promise<Result>) {
  if (backend.unavailable) throw new Error('Operational database unavailable');
  const stored = backend.records.get(tenant);
  if (stored && stored.domain !== logical) throw new Error('Stored namespace mismatch');
  const snapshot = structuredClone(stored?.payload ?? initialize());
  if (mode === 'read' && !stored) backend.records.set(tenant, { domain: logical, payload: structuredClone(snapshot) });
  const result = await fn(snapshot);
  if (mode === 'write' && result.commit !== false) {
    if (backend.failCommit) throw new Error('Operational database commit failed');
    backend.records.set(tenant, { domain: logical, payload: structuredClone(result.payload === undefined ? snapshot : result.payload) });
  }
  return result.value;
}
const persisted = (tenant = canonical) => backend.records.get(tenant)!.payload as WorkspaceRecordState;
function signIn(tenant = canonical) { vi.stubEnv('PROPBREW_REVIEW_TENANT_UUID', tenant); backend.cookies.set(REVIEW_SESSION_COOKIE, issueReviewSession()); }
beforeEach(() => {
  vi.clearAllMocks(); backend.records.clear(); backend.cookies.clear(); backend.unavailable = false; backend.failCommit = false;
  backend.repository.mockImplementation(repository);
  for (const [key, value] of Object.entries({
    NODE_ENV: 'production', DATA_SOURCE: 'postgres', PROPBREW_REVIEW_MODE: '1', PROPBREW_WEBSITE_ONLY: '0',
    PROPBREW_REVIEW_PASSWORD_HASH: `scrypt$16384$8$1$${Buffer.alloc(16, 7).toString('base64url')}$${Buffer.alloc(64, 8).toString('base64url')}`,
    PROPBREW_REVIEW_SESSION_SECRET: Buffer.alloc(32, 9).toString('base64url'), PROPBREW_REVIEW_TENANT_UUID: canonical,
    DATABASE_URL: 'postgresql://unit-test.invalid/review', NEXT_PUBLIC_SITE_URL: 'https://private-review.example', REEVE_AI_DAILY_CAP_MINOR_NGN: '500000',
  })) vi.stubEnv(key, value);
  for (const key of ['REEVE_ALLOW_DEMO_IDENTITIES', 'REEVE_ALLOW_IN_MEMORY_DATA', 'NEXT_PUBLIC_DEV_IDENTITY', 'CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'PAYSTACK_SECRET_KEY', 'FLUTTERWAVE_SECRET_KEY', 'FLUTTERWAVE_WEBHOOK_SECRET', 'TERMII_API_KEY', 'RESEND_API_KEY', 'WHATSAPP_ACCESS_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'ANTHROPIC_API_KEY']) vi.stubEnv(key, '');
  signIn();
});
afterEach(() => { expect(currentRecordContext()).toBeUndefined(); vi.unstubAllEnvs(); });

describe('authenticated durable record boundaries', () => {
  it('authenticates the signed cookie before loading a canonical tenant and never exposes global fallback records', async () => {
    const actor = await withDurableRead(async () => {
      expect(currentRecordContext()?.mode).toBe('read');
      expect(db.sites.every((row) => row.tenantId === domain)).toBe(true);
      return getActor();
    });
    expect(actor.tenantId).toBe(domain);
    expect(backend.repository).toHaveBeenCalledWith(canonical, domain, 'read', expect.any(Function), expect.any(Function));
    expect(() => db.sites).toThrow('authenticated record context');
    expect(() => getHistory('work-order', 'any')).toThrow('record context');
    expect(() => getRecordAuxiliary('outside', () => ({}))).toThrow('record context');
  });

  it.each([undefined, 'forged.signature'])('does not hydrate records for an absent or invalid review cookie: %s', async (cookie) => {
    backend.cookies.clear(); if (cookie) backend.cookies.set(REVIEW_SESSION_COOKIE, cookie);
    await expect(withDurableRead(getActor)).rejects.toThrow('REDIRECT:/review/login');
    await expect(withDurableMutation(async () => { db.sites[0].name = 'Unauthenticated write'; return { ok: true }; })).rejects.toThrow('record context');
    expect(backend.repository).not.toHaveBeenCalled(); expect(backend.records.size).toBe(0);
  });

  it('does not fall back to fixtures when loading or committing to the database fails', async () => {
    const callback = vi.fn(async () => db.sites.length); backend.unavailable = true;
    await expect(withDurableRead(callback)).rejects.toThrow('database unavailable');
    expect(callback).not.toHaveBeenCalled(); expect(backend.records.size).toBe(0);
    backend.unavailable = false;
    const name = await withDurableRead(async () => db.sites[0].name);
    backend.failCommit = true;
    await expect(withDurableMutation(async () => { db.sites[0].name = 'Uncommitted'; return { ok: true }; })).rejects.toThrow('commit failed');
    backend.failCommit = false;
    expect(await withDurableRead(async () => db.sites[0].name)).toBe(name);
  });

  it('rolls back failed results and exceptions together with history, auxiliary data and sequences', async () => {
    const original = await withDurableRead(async () => db.sites[0].name);
    const before = structuredClone(persisted());
    const result = await withDurableMutation(async () => {
      db.sites[0].name = 'Declined'; getRecordAuxiliary('regression', () => ({ saved: false })).saved = true;
      nextRecordSequence('regression', 100);
      recordHistory('work-order', 'boundary-test', { at: '2026-10-24T12:00:00Z', event: 'CREATE', from: null, to: 'new', actorId: reviewer, actorName: 'Reviewer', actorRole: 'estate_manager' });
      return { ok: false, error: 'Review declined' };
    });
    expect(result).toEqual({ ok: false, error: 'Review declined' }); expect(persisted()).toEqual(before);
    await expect(withDurableMutation(async () => { db.sites[0].name = 'Thrown change'; throw new Error('Rejected mutation'); })).rejects.toThrow('Rejected mutation');
    expect(await withDurableRead(async () => db.sites[0].name)).toBe(original);
  });

  it('reconstructs persisted creator grants before actor authorization, without accepting an unreceipted assignment', async () => {
    const state = initialWorkspaceRecordState(domain);
    const sites = state.collections.sites as typeof db.sites;
    const property = { ...sites[0], id: 'estate-created-before-restart' as typeof sites[number]['id'], name: 'Persisted creator estate', kind: 'estate' as const };
    sites.push(property);
    const assignments = state.collections.estateCreatorAssignments as typeof db.estateCreatorAssignments;
    assignments.push({ tenantId: domain, userId: reviewer, siteId: property.id, source: 'estate_property_registration', createdAt: '2026-10-24T12:00:00Z' });
    backend.records.set(canonical, { domain, payload: structuredClone(state) });
    expect((await withDurableRead(getActor)).estateIds).not.toContain(property.id);
    const receipts = state.collections.estateRegistrationReceipts as typeof db.estateRegistrationReceipts;
    receipts.push({ tenantId: domain, actorId: reviewer, key: 'trusted-creation-receipt', kind: 'property', payloadHash: 'verified', result: { id: property.id, name: property.name }, createdAt: '2026-10-24T12:00:00Z' });
    backend.records.set(canonical, { domain, payload: state });
    expect((await withDurableRead(getActor)).estateIds).toContain(property.id);
  });

  it('keeps read-only edits detached and obtains a fresh write context when a read invokes a mutation', async () => {
    const original = await withDurableRead(async () => db.sites[0].name);
    await withDurableRead(async () => {
      db.sites[0].name = 'Read-only transient edit';
      expect(() => nextRecordSequence('read-must-not-allocate', 0)).toThrow('read cannot allocate');
      await withDurableMutation(async () => {
        expect(currentRecordContext()?.mode).toBe('write'); expect(db.sites[0].name).toBe(original);
        db.sites[0].name = 'Committed fresh write'; return { ok: true };
      });
      expect(currentRecordContext()?.mode).toBe('read'); expect(db.sites[0].name).toBe('Read-only transient edit');
    });
    expect(await withDurableRead(async () => db.sites[0].name)).toBe('Committed fresh write');
    expect(backend.repository.mock.calls.map((call) => call[2])).toEqual(['read', 'read', 'write', 'read']);
  });

  it('separates canonical workspace mappings and concurrently active logical tenant contexts', async () => {
    await withDurableMutation(async () => { db.sites[0].name = 'Workspace A only'; return { ok: true }; });
    signIn(secondCanonical);
    expect(await withDurableRead(async () => db.sites[0].name)).not.toBe('Workspace A only');
    signIn(); expect(await withDurableRead(async () => db.sites[0].name)).toBe('Workspace A only');
    const first = initialWorkspaceRecordState(domain), second = initialWorkspaceRecordState(SEED.tenantB);
    const observed = await Promise.all([[first, domain], [second, SEED.tenantB]].map(async ([state, tenant]) => runWithRecordContext({ state: state as WorkspaceRecordState, domainTenantId: tenant as string, mode: 'read' }, async () => {
      await Promise.resolve(); return { tenant: currentRecordContext()!.domainTenantId, tenants: db.sites.map((site) => site.tenantId) };
    })));
    expect(observed).toEqual([{ tenant: domain, tenants: expect.arrayContaining([domain]) }, { tenant: SEED.tenantB, tenants: expect.arrayContaining([SEED.tenantB]) }]);
    for (const item of observed) expect(item.tenants.every((tenant) => tenant === item.tenant)).toBe(true);
  });

  it('rejects foreign or incomplete database payloads before executing the domain callback', async () => {
    const state = initialWorkspaceRecordState(domain);
    (state.collections.sites as typeof db.sites).push({ ...(state.collections.sites as typeof db.sites)[0], tenantId: SEED.tenantB as typeof db.sites[number]['tenantId'] });
    backend.records.set(canonical, { domain, payload: state });
    const callback = vi.fn(async () => true);
    await expect(withDurableRead(callback)).rejects.toThrow('Foreign tenant'); expect(callback).not.toHaveBeenCalled();
    delete state.collections.sites;
    backend.records.set(canonical, { domain, payload: state });
    await expect(withDurableRead(callback)).rejects.toThrow('incomplete'); expect(callback).not.toHaveBeenCalled();
  });
});

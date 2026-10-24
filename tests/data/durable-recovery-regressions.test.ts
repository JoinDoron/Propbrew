import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRecordState } from '@/server/data/record-context';

const transport = vi.hoisted(() => ({
  cookies: new Map<string, string>(), stored: undefined as unknown, calls: vi.fn(),
}));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (key: string) => transport.cookies.has(key) ? { value: transport.cookies.get(key)! } : undefined }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error('REDIRECT:' + href); }, notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@/server/data/workspace-postgres', () => ({ withWorkspaceState: transport.calls }));

const canonical = '12345678-1234-4234-8234-123456789abc';
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));
type Outcome = { value: unknown; payload?: unknown; commit?: boolean };
const persisted = () => transport.stored as WorkspaceRecordState;

beforeEach(async () => {
  vi.resetModules(); vi.clearAllMocks(); transport.cookies.clear(); transport.stored = undefined;
  // Substitute only SQL transport; real cookies, identity, ALS, domain actions
  // and commit/decline handling execute with DATA_SOURCE=postgres throughout.
  transport.calls.mockImplementation(async (tenant: string, logical: string, mode: string, initialize: () => unknown, fn: (payload: unknown) => Promise<Outcome>) => {
    expect(tenant).toBe(canonical); expect(logical).toBe('t-lekki');
    const snapshot = json(transport.stored ?? initialize());
    if (mode === 'read' && !transport.stored) transport.stored = json(snapshot);
    const result = await fn(snapshot);
    if (mode === 'write' && result.commit !== false) transport.stored = json(result.payload ?? snapshot);
    return result.value;
  });
  for (const [key, value] of Object.entries({
    NODE_ENV: 'production', DATA_SOURCE: 'postgres', PROPBREW_REVIEW_MODE: '1', PROPBREW_WEBSITE_ONLY: '0',
    PROPBREW_REVIEW_PASSWORD_HASH: `scrypt$16384$8$1$${Buffer.alloc(16, 7).toString('base64url')}$${Buffer.alloc(64, 8).toString('base64url')}`,
    PROPBREW_REVIEW_SESSION_SECRET: Buffer.alloc(32, 9).toString('base64url'), PROPBREW_REVIEW_TENANT_UUID: canonical,
    DATABASE_URL: 'postgresql://unit-test.invalid/review', NEXT_PUBLIC_SITE_URL: 'https://private-review.example', REEVE_AI_DAILY_CAP_MINOR_NGN: '500000',
  })) vi.stubEnv(key, value);
  for (const key of ['REEVE_ALLOW_DEMO_IDENTITIES', 'REEVE_ALLOW_IN_MEMORY_DATA', 'NEXT_PUBLIC_DEV_IDENTITY', 'CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'PAYSTACK_SECRET_KEY', 'FLUTTERWAVE_SECRET_KEY', 'FLUTTERWAVE_WEBHOOK_SECRET', 'TERMII_API_KEY', 'RESEND_API_KEY', 'WHATSAPP_ACCESS_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'ANTHROPIC_API_KEY']) vi.stubEnv(key, '');
  const auth = await import('@/server/review-auth');
  transport.cookies.set(auth.REVIEW_SESSION_COOKIE, auth.issueReviewSession());
});
afterEach(() => vi.unstubAllEnvs());

describe('durable recovery across fresh authenticated requests', () => {
  it('keeps only a rejected offline capture receipt, then discards it after a fresh module graph without resurrecting it', async () => {
    const { withDurableRead } = await import('@/server/data/durable-records');
    const { db } = await import('@/server/data/store');
    const { getActor } = await import('@/server/session');
    const { outboxOwnerKey } = await import('@/domain/sync');
    const { syncOperation } = await import('@/server/actions/sync');
    const captured = await withDurableRead(async () => ({ actor: await getActor(), report: db.constructionReports.find((row) => row.status !== 'draft')! }));
    expect(captured.report).toBeDefined();
    const before = json(persisted());
    const owner = outboxOwnerKey(captured.actor.tenantId, captured.actor.userId);
    if (!owner) throw new Error('The authenticated reviewer has no queue owner.');
    const input = {
      id: 'durable-conflict-' + randomUUID(), owner,
      kind: 'daily_report' as const, capturedISO: '2026-10-24T11:00:00Z',
      payload: { projectId: captured.report.projectId, dateISO: captured.report.dateISO, workforceCount: 2 },
    };
    expect(await syncOperation(input)).toMatchObject({ ok: false, conflict: true });
    expect(persisted().collections.syncLedger).toEqual([expect.objectContaining({ opId: input.id, actorId: captured.actor.userId, status: 'pending' })]);
    expect({ ...persisted(), collections: { ...persisted().collections, syncLedger: before.collections.syncLedger } }).toEqual(before);

    vi.resetModules();
    const fresh = await import('@/server/actions/sync');
    expect(await fresh.abandonOperation(input)).toEqual({ ok: true });
    expect(persisted().collections.syncLedger).toEqual([expect.objectContaining({ opId: input.id, status: 'abandoned' })]);
    expect(await fresh.syncOperation(input)).toMatchObject({ ok: false, conflict: true, serverState: 'Discarded by its author' });
    expect(persisted().collections.constructionReports).toEqual(before.collections.constructionReports);
  });

  it('reconstructs a persisted creator scope and redirects an existing signed-in review login', async () => {
    const { addEstateProperty } = await import('@/server/actions/estate-registration');
    const created = await addEstateProperty({ name: 'Persistent login estate', address: '18 Sample Road, Lagos, Nigeria', unitCount: 1, unitType: 'Apartment', idempotencyKey: randomUUID() });
    expect(created).toMatchObject({ ok: true });
    if (!created.ok) throw new Error(created.error);
    vi.resetModules();
    const auth = await import('@/server/review-auth');
    const { currentRecordContext } = await import('@/server/data/record-context');
    expect(currentRecordContext()).toBeUndefined();
    expect((await auth.getReviewSession())?.actor.estateIds).toContain(created.id);
    expect(currentRecordContext()).toBeUndefined();
    const { default: Login } = await import('@/app/review/login/page');
    await expect(Login({ searchParams: Promise.resolve({}) })).rejects.toThrow('REDIRECT:/workspaces');
    expect(transport.calls.mock.calls.at(-1)?.[2]).toBe('read');
  });

  it('does not hydrate a review identity for an invalid cookie', async () => {
    const { REVIEW_SESSION_COOKIE, getReviewSession } = await import('@/server/review-auth');
    transport.cookies.set(REVIEW_SESSION_COOKIE, 'forged.signature');
    expect(await getReviewSession()).toBeNull();
    expect(transport.calls).not.toHaveBeenCalled();
  });

  it('retains receipt metadata without retaining declined record, history or sequence changes', async () => {
    const { withDurableRead, withDurableMutation } = await import('@/server/data/durable-records');
    const { db, recordHistory } = await import('@/server/data/store');
    const { retainPendingSyncReceipt, nextRecordSequence } = await import('@/server/data/record-context');
    await withDurableRead(async () => db.sites.length);
    const before = json(persisted());
    const receipt = { tenantId: 't-lekki', actorId: 'propbrew-private-review-estate-manager', opId: 'owned-conflict', kind: 'site_issue', payloadHash: 'a'.repeat(64), status: 'pending', appliedISO: '2026-10-24T11:00:00Z' };
    expect(await withDurableMutation(async () => {
      db.sites[0].name = 'Must roll back'; nextRecordSequence('failed-reference', 0);
      recordHistory('work-order', 'declined', { at: '2026-10-24T11:00:00Z', event: 'CREATE', from: null, to: 'new', actorId: receipt.actorId, actorName: 'Reviewer', actorRole: 'estate_manager' });
      retainPendingSyncReceipt(receipt); return { ok: false };
    })).toEqual({ ok: false });
    expect(persisted()).toEqual({ ...before, collections: { ...before.collections, syncLedger: [receipt] } });
    await expect(withDurableMutation(async () => { retainPendingSyncReceipt({ ...receipt, tenantId: 'foreign' }); return { ok: false }; })).rejects.toThrow('Invalid offline recovery receipt');
    expect(persisted().collections.syncLedger).toEqual([receipt]);
  });

  it('meters a delayed read through fresh write state without overwriting intervening operational changes', async () => {
    const { withDurableRead, withDurableMutation } = await import('@/server/data/durable-records');
    const { db } = await import('@/server/data/store');
    const { recordUsage } = await import('@/server/copilot/metering');
    let requests = 0;
    await withDurableRead(async () => {
      const staleName = db.sites[0].name; requests = db.copilotUsage[0].requests;
      await withDurableMutation(async () => { db.sites[0].name = 'Saved during provider response'; return { ok: true }; });
      await recordUsage('t-lekki', 10, 5, 'gpt-6.1-sol');
      expect(db.sites[0].name).toBe(staleName);
    });
    expect(await withDurableRead(async () => ({ name: db.sites[0].name, requests: db.copilotUsage[0].requests })))
      .toEqual({ name: 'Saved during provider response', requests: requests + 1 });
  });
});

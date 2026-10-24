import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({ cookies: new Map<string, string>() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => boundary.cookies.has(name) ? { value: boundary.cookies.get(name)! } : undefined }) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); } }));

const processState = globalThis as typeof globalThis & { __propbrewMemoryStoreV1?: unknown };
beforeEach(() => {
  vi.resetModules();
  delete processState.__propbrewMemoryStoreV1;
  boundary.cookies.clear();
  for (const [key, value] of Object.entries({
    NODE_ENV: 'production', PROPBREW_REVIEW_MODE: '1', PROPBREW_WEBSITE_ONLY: '0', DATA_SOURCE: 'memory',
    PROPBREW_REVIEW_PASSWORD_HASH: `scrypt$16384$8$1$${Buffer.alloc(16, 7).toString('base64url')}$${Buffer.alloc(64, 8).toString('base64url')}`,
    PROPBREW_REVIEW_SESSION_SECRET: Buffer.alloc(32, 9).toString('base64url'), PROPBREW_REVIEW_TENANT_UUID: '12345678-1234-4234-8234-123456789abc',
    DATABASE_URL: 'postgresql://unit-test.invalid/review', NEXT_PUBLIC_SITE_URL: 'https://private-review.example', REEVE_AI_DAILY_CAP_MINOR_NGN: '500000',
  })) vi.stubEnv(key, value);
  for (const key of ['CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'PAYSTACK_SECRET_KEY', 'FLUTTERWAVE_SECRET_KEY', 'FLUTTERWAVE_WEBHOOK_SECRET', 'TERMII_API_KEY', 'RESEND_API_KEY', 'WHATSAPP_ACCESS_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'ANTHROPIC_API_KEY']) vi.stubEnv(key, '');
});
afterEach(() => { delete processState.__propbrewMemoryStoreV1; vi.unstubAllEnvs(); });

describe('process-local review store across server bundle evaluations', () => {
  it('retains created property provenance, tenant occupancy and records in a freshly evaluated copilot module graph', async () => {
    const writer = await import('@/server/data/store');
    const authentication = await import('@/server/review-auth');
    boundary.cookies.set(authentication.REVIEW_SESSION_COOKIE, authentication.issueReviewSession());
    const registration = await import('@/server/actions/estate-registration');
    const propertyInput = { name: 'QA Audit Estate', address: '14 Sample Road, Abuja, Nigeria', unitCount: 2, unitType: 'Apartment', idempotencyKey: randomUUID() };
    const property = await registration.addEstateProperty(propertyInput);
    if (!property.ok) throw new Error(property.error);
    const unit = writer.db.units.find((row) => row.siteId === property.id)!;
    const resident = await registration.addEstateTenant({ name: 'QA Sample Resident', unitId: unit.id, moveInDate: '2026-07-26', household: 2, idempotencyKey: randomUUID() });
    expect(resident).toMatchObject({ ok: true });

    // Separate Next server-action and API bundles can evaluate this source again.
    vi.resetModules();
    const session = await (await import('@/server/session')).getSession();
    expect(session?.key).toBe('private-review');
    expect(session?.actor.estateIds).toEqual(['s-gardens', property.id]);
    const { buildEstateContext } = await import('@/server/ai/context/estate');
    const context = await buildEstateContext(session!.actor);
    expect(context.facts.properties).toEqual(expect.arrayContaining([expect.objectContaining({ id: property.id, name: 'QA Audit Estate', recordedUnitCount: 2 })]));
    expect(context.facts.units).toEqual(expect.arrayContaining([expect.objectContaining({ id: unit.id, siteId: property.id, occupancy: 'occupied' })]));
    expect(context.facts.residents).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'QA Sample Resident', siteId: property.id, unitId: unit.id })]));
    expect(context.coverage.find((row) => row.collection === 'Estate properties')).toMatchObject({ loaded: 2, complete: true });
    const reader = await import('@/server/data/store');
    expect(reader.db).toBe(writer.db);
    const reloadedRegistration = await import('@/server/actions/estate-registration');
    const count = reader.db.sites.length;
    expect(await reloadedRegistration.addEstateProperty(propertyInput)).toEqual(property);
    expect(reader.db.sites).toHaveLength(count);
    const foreignContext = await buildEstateContext({ ...session!.actor, tenantId: 't-ikoyi', estateIds: [property.id] });
    expect(JSON.stringify(foreignContext)).not.toContain('QA Audit Estate');
    expect(JSON.stringify(foreignContext)).not.toContain('QA Sample Resident');
  });

  it('shares audit history without replaying wallet settlement or seed history on later evaluations', async () => {
    const writer = await import('@/server/data/store');
    const invoice = writer.db.invoices.find((row) => writer.db.wallets.some((wallet) => wallet.unitId === row.unitId))!;
    const wallet = writer.db.wallets.find((row) => row.unitId === invoice.unitId)!;
    invoice.amount = { ...invoice.amount, minor: 10000 };
    invoice.paid = { ...invoice.paid, minor: 0 };
    invoice.status = 'issued';
    wallet.available = { ...wallet.available, minor: 5000 };
    writer.recordHistory('work-order', 'process-audit-check', { at: '2026-10-24T12:00:00Z', event: 'CREATE', from: null, to: 'new', actorId: 'review-test', actorName: 'Review test', actorRole: 'estate_manager' });
    const history = structuredClone(writer.getAllHistory());

    vi.resetModules();
    const reader = await import('@/server/data/store');
    expect(reader.db).toBe(writer.db);
    expect(reader.getAllHistory()).toEqual(history);
    expect(reader.db.invoices.find((row) => row.id === invoice.id)?.paid.minor).toBe(0);
    expect(reader.db.wallets.find((row) => row.unitId === wallet.unitId)?.available.minor).toBe(5000);
  });
});

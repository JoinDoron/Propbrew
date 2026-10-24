import { randomUUID } from 'node:crypto';
import { isValidElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const boundary = vi.hoisted(() => ({ cookies: new Map<string, string>(), revalidate: vi.fn(), control: vi.fn(), reserve: vi.fn(), finish: vi.fn(), auth: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({ get: (name: string) => boundary.cookies.has(name) ? { value: boundary.cookies.get(name)! } : undefined }) }));
vi.mock('next/cache', () => ({ revalidatePath: boundary.revalidate }));
vi.mock('next/navigation', () => ({ redirect: (path: string) => { throw new Error(`REDIRECT:${path}`); }, notFound: () => { throw new Error('NOT_FOUND'); } }));
vi.mock('@clerk/nextjs/server', () => ({ auth: boundary.auth }));
vi.mock('@/server/ai/durable', () => ({ featureControl: boundary.control }));
vi.mock('@/server/ai/copilot-ledger', () => ({ reserveCopilotBudget: boundary.reserve, finishCopilotBudget: boundary.finish }));
vi.mock('@/server/copilot/metering', () => ({ checkRate: () => ({ allowed: true }), dailyCapMinorNgn: () => 500000, getTenantModel: () => 'gpt-6.1-sol', recordUsage: vi.fn() }));
vi.mock('@/server/ai/copilot-provider', async (original) => ({
  ...await original<typeof import('@/server/ai/copilot-provider')>(),
  resolveCopilotProvider: () => ({ model: {}, modelName: 'unit-test-model', provider: 'openai' }),
  streamCopilotAnswer: () => ({ fullStream: (async function* () {
    yield { type: 'text-delta', text: 'Sample record review.' };
    yield { type: 'finish', finishReason: 'stop', totalUsage: { inputTokens: 10, outputTokens: 5 } };
  })() }),
}));

import { db } from '@/server/data/store';
import { repos } from '@/server/data';
import { getSession } from '@/server/session';
import { isReviewActor, issueReviewSession, REVIEW_SESSION_COOKIE, reviewActorIdentity, reviewLedgerTenantId } from '@/server/review-auth';
import { withCreatedEstateAssignments } from '@/server/data/estate-creation-scope';
import { addEstateProperty, addEstateTenant } from '@/server/actions/estate-registration';
import { handleCopilot } from '@/server/ai/copilot';
import { buildEstateContext } from '@/server/ai/context/estate';
import { EstateHome } from '@/components/workspaces/estate-home';
import EstatePropertiesPage from '@/app/(ops)/(estate)/properties/page';
import PeoplePage from '@/app/(ops)/(estate)/people/page';
import { EstateCreateActions } from '@/components/workspaces/estate-create-actions';

const initial = structuredClone(db);
const origin = 'https://private-review.example';
const ledgerTenant = '12345678-1234-4234-8234-123456789abc';
const propertyInput = () => ({ name: 'Review Palm Court', address: '14 Sample Road, Lagos, Nigeria', unitCount: 2, unitType: 'Apartment', idempotencyKey: randomUUID() });
const tenantInput = (unitId: string) => ({ name: 'Sample Resident', unitId, moveInDate: '2026-07-26', household: 2, idempotencyKey: randomUUID() });
const count = () => ({ sites: db.sites.length, units: db.units.length, residents: db.residents.length, receipts: db.estateRegistrationReceipts.length, assignments: db.estateCreatorAssignments.length });

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(db, structuredClone(initial));
  for (const [key, value] of Object.entries({
    NODE_ENV: 'production', PROPBREW_REVIEW_MODE: '1', PROPBREW_WEBSITE_ONLY: '0', DATA_SOURCE: 'memory',
    PROPBREW_REVIEW_PASSWORD_HASH: `scrypt$16384$8$1$${Buffer.alloc(16, 7).toString('base64url')}$${Buffer.alloc(64, 8).toString('base64url')}`,
    PROPBREW_REVIEW_SESSION_SECRET: Buffer.alloc(32, 9).toString('base64url'), PROPBREW_REVIEW_TENANT_UUID: ledgerTenant,
    DATABASE_URL: 'postgresql://unit-test.invalid/review', NEXT_PUBLIC_SITE_URL: origin, REEVE_AI_DAILY_CAP_MINOR_NGN: '500000',
  })) vi.stubEnv(key, value);
  for (const key of ['REEVE_ALLOW_DEMO_IDENTITIES', 'REEVE_ALLOW_IN_MEMORY_DATA', 'NEXT_PUBLIC_DEV_IDENTITY', 'CLERK_SECRET_KEY', 'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'PAYSTACK_SECRET_KEY', 'FLUTTERWAVE_SECRET_KEY', 'FLUTTERWAVE_WEBHOOK_SECRET', 'TERMII_API_KEY', 'RESEND_API_KEY', 'WHATSAPP_ACCESS_TOKEN', 'BLOB_READ_WRITE_TOKEN', 'ANTHROPIC_API_KEY']) vi.stubEnv(key, '');
  boundary.cookies.clear(); boundary.cookies.set(REVIEW_SESSION_COOKIE, issueReviewSession());
  boundary.control.mockResolvedValue({ enabled: true, dailyCapMinorNgn: 125000 });
  boundary.reserve.mockResolvedValue({ allowed: true }); boundary.finish.mockResolvedValue({ recorded: true });
});
afterEach(() => { Object.assign(db, structuredClone(initial)); vi.unstubAllEnvs(); });

describe('signed private-review sample registration', () => {
  it('retains created property scope on subsequent signed requests and records tenant occupancy idempotently', async () => {
    const beforeActor = reviewActorIdentity().actor;
    const input = propertyInput();
    const property = await addEstateProperty(input);
    expect(property).toMatchObject({ ok: true });
    if (!property.ok) throw new Error(property.error);
    const afterProperty = count();
    expect(await addEstateProperty(input)).toEqual(property); expect(count()).toEqual(afterProperty);
    const current = (await getSession())!;
    expect(current.key).toBe('private-review');
    expect(current.actor.estateIds).toEqual(['s-gardens', property.id]);
    expect(isReviewActor(current.actor)).toBe(true);
    expect(isReviewActor(beforeActor)).toBe(true);
    expect(reviewLedgerTenantId()).toBe(ledgerTenant);
    // The ordinary production/demo helper still cannot grant memory scope.
    expect(withCreatedEstateAssignments(beforeActor).estateIds).toEqual(beforeActor.estateIds);
    expect(repos.sites.list(current.actor).items.some((site) => site.id === property.id)).toBe(true);
    const unit = repos.units.list(current.actor).items.find((row) => row.siteId === property.id)!;
    const residentInput = tenantInput(String(unit.id));
    const resident = await addEstateTenant(residentInput);
    expect(resident).toMatchObject({ ok: true });
    const afterResident = count();
    expect(await addEstateTenant(residentInput)).toEqual(resident); expect(count()).toEqual(afterResident);
    expect(unit.occupancy).toBe('occupied');
    expect(await addEstateTenant({ ...residentInput, idempotencyKey: randomUUID() })).toMatchObject({ ok: false });
    expect(count()).toEqual(afterResident);
    expect(repos.residents.list((await getSession())!.actor).items.some((row) => resident.ok && row.id === resident.id)).toBe(true);
  });

  it('reserves future move-ins relative to the sample snapshot rather than the real server date', async () => {
    const property = await addEstateProperty(propertyInput());
    if (!property.ok) throw new Error(property.error);
    const unit = db.units.find((row) => row.siteId === property.id)!;
    const result = await addEstateTenant({ ...tenantInput(String(unit.id)), moveInDate: '2026-08-01' });
    expect(result).toMatchObject({ ok: true });
    expect(unit.occupancy).toBe('reserved');
    expect(db.residents.find((row) => result.ok && row.id === result.id)?.status).toBe('invited');
  });

  it('keeps the canonical AI ledger UUID after a created property is added to the signed actor scope', async () => {
    const property = await addEstateProperty(propertyInput());
    if (!property.ok) throw new Error(property.error);
    const response = await handleCopilot(new Request(`${origin}/api/estate/copilot`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'Review my sample estate properties.' }) }), 'estate', buildEstateContext);
    const events = (await response.text()).trim().split('\n').map((line) => JSON.parse(line));
    expect(events.at(-1)).toMatchObject({ type: 'complete', usage: { recorded: true } });
    expect(boundary.control).toHaveBeenCalledWith(ledgerTenant, 'estate_copilot');
    expect(boundary.reserve).toHaveBeenCalledWith(expect.objectContaining({ tenantId: ledgerTenant, actorId: 'propbrew-private-review-estate-manager' }));
    expect(boundary.finish).toHaveBeenCalledWith(expect.objectContaining({ tenantId: ledgerTenant, status: 'complete' }));
  });

  it('rejects arbitrary scope extras and revokes created scope when its trusted receipt no longer matches', async () => {
    const property = await addEstateProperty(propertyInput());
    if (!property.ok) throw new Error(property.error);
    const current = (await getSession())!.actor;
    expect(isReviewActor({ ...current, estateIds: [...current.estateIds, 's-victoria'] })).toBe(false);
    expect(isReviewActor({ ...current, estateIds: [property.id] })).toBe(false);
    expect(isReviewActor({ ...current, estateIds: [...current.estateIds, property.id] })).toBe(false);
    const unit = db.units.find((row) => row.siteId === property.id)!;
    db.estateRegistrationReceipts[0].actorId = 'another-user';
    expect((await getSession())!.actor.estateIds).toEqual(['s-gardens']);
    expect(isReviewActor(current)).toBe(false);
    expect(await addEstateTenant(tenantInput(String(unit.id)))).toMatchObject({ ok: false });
    expect(unit.occupancy).toBe('vacant');
  });

  it('does not register from signed-out or forged unsigned identities', async () => {
    const before = count(); boundary.cookies.clear(); boundary.cookies.set('vesta_dev_identity', 'estate_manager');
    expect(await addEstateProperty(propertyInput())).toMatchObject({ ok: false });
    boundary.cookies.set(REVIEW_SESSION_COOKIE, 'estate_manager');
    expect(await addEstateProperty(propertyInput())).toMatchObject({ ok: false });
    expect(count()).toEqual(before);
  });

  it('keeps non-review production and HTTP-backed registration fail-closed without invoking Clerk', async () => {
    const before = count();
    vi.stubEnv('PROPBREW_REVIEW_MODE', '0'); vi.stubEnv('DATA_SOURCE', 'http');
    vi.stubEnv('CLERK_SECRET_KEY', 'test-only-clerk'); vi.stubEnv('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY', 'test-only-clerk-publishable');
    expect(await addEstateProperty(propertyInput())).toMatchObject({ ok: false, error: expect.stringContaining('durable registration adapter') });
    expect(await addEstateTenant(tenantInput('u-c06a'))).toMatchObject({ ok: false });
    expect(boundary.auth).not.toHaveBeenCalled(); expect(count()).toEqual(before);
    vi.stubEnv('PROPBREW_REVIEW_MODE', '1');
    expect(await addEstateProperty(propertyInput())).toMatchObject({ ok: false }); expect(count()).toEqual(before);
  });
});

function creationProps(value: unknown, seen = new Set<unknown>()): { demo: boolean; asOfDate: string }[] {
  if (!value || typeof value !== 'object' || seen.has(value)) return [];
  seen.add(value);
  if (isValidElement<{ demo: boolean; asOfDate: string }>(value) && value.type === EstateCreateActions) return [value.props];
  return Object.values(value).flatMap((child) => creationProps(child, seen));
}

it('exposes sample-only forms with the pinned date on Estate, Properties and Residents in production review', async () => {
  for (const tree of [await EstateHome(), await EstatePropertiesPage(), await PeoplePage()]) {
    const actions = creationProps(tree);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({ demo: true, asOfDate: '2026-07-26' });
  }
});

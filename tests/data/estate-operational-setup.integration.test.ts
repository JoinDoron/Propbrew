import { randomUUID } from 'node:crypto';
import { Client, type Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runMigrations } from '../../scripts/migrate.mjs';
import { getNativeAuth } from '@/server/auth/auth';
import { activateCompany, provisionCompany, type NativeIdentity } from '@/server/auth/company';
import { addEstateTenant, addEstateProperty } from '@/server/actions/estate-registration';
import { createEstateInvoice, createEstateRecurringCharge, generateDueEstateCharges, issueEstateInvoice } from '@/server/actions/estate-billing-setup';
import { createEstateTenancyAgreement } from '@/server/actions/estate-tenancy-setup';
import { advanceTenancy } from '@/server/actions/estate';
import { createEstateAmenity, createEstateAmenityBooking, archiveEstateAmenity } from '@/server/actions/estate-amenity-setup';
import { transition } from '@/server/actions/transitions';
import { runEstateRecurringSweep } from '@/server/jobs/estate-recurring';
import { withAuthTransaction } from '@/server/auth/database';

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({ headers: async () => request.headers }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// This suite owns synthetic accounts only in the runner's disposable cluster.
const testUrl = process.env.PROPBREW_TEST_DATABASE_URL;
if (testUrl && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(testUrl).hostname)) {
  throw new Error('Company onboarding tests require a disposable loopback database.');
}
const origin = 'https://estate-setup-integration.example';
const password = 'Disposable-onboarding-passphrase-24!';
const runId = randomUUID().slice(0, 8);
type Browser = { cookies: Map<string, string>; identity: NativeIdentity };
let admin: Client;
let owner: Browser, other: Browser, member: Browser;
let company: string, otherCompany: string, residentId: string, unitId: string, siteId: string;

function cookieHeader(browser: Pick<Browser, 'cookies'>): string {
  return [...browser.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
}
function requestAs(browser: Pick<Browser, 'cookies'>) {
  request.headers = new Headers({ origin, cookie: cookieHeader(browser) });
}
async function http(browser: Pick<Browser, 'cookies'>, path: string, body?: Record<string, unknown>) {
  // Give this suite its own synthetic loopback client; the account suite
  // intentionally exhausts signup limits on its distinct test IP.
  const headers = new Headers({ origin, 'x-forwarded-for': '127.0.0.47', cookie: cookieHeader(browser) });
  if (body) headers.set('content-type', 'application/json');
  const response = await getNativeAuth().handler(new Request(`${origin}/api/auth${path}`, {
    method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined,
  }));
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0], separator = pair.indexOf('=');
    const name = pair.slice(0, separator), value = pair.slice(separator + 1);
    if (!value || /max-age=0(?:;|$)/i.test(cookie)) browser.cookies.delete(name);
    else browser.cookies.set(name, value);
  }
  return { response, data: await response.json() };
}
async function signup(label: string): Promise<Browser> {
  const browser = { cookies: new Map<string, string>() };
  const result = await http(browser, '/sign-up/email', { name: `Synthetic ${label}`, email: `${label}-${runId}@example.invalid`, password });
  expect(result.response.status).toBe(200);
  return { ...browser, identity: (await http(browser, '/get-session')).data as NativeIdentity };
}
async function select(browser: Browser, id: string) {
  await activateCompany(browser.identity, id);
  browser.identity = (await http(browser, '/get-session')).data as NativeIdentity;
  requestAs(browser);
}
async function snapshot(id: string) {
  return (await admin.query('select version::text,payload from workspace_records where tenant_id=$1::uuid', [id])).rows[0];
}
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const binding = () => ({ expectedCompanyId: company, idempotencyKey: randomUUID() });

describe.skipIf(!testUrl)('Estate setup from an empty company with real sessions and PostgreSQL', () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: testUrl }); await admin.connect();
    await admin.query("do $$ begin if not exists(select from pg_roles where rolname='propbrew_review_app') then create role propbrew_review_app login nosuperuser nocreatedb nocreaterole nobypassrls; end if; end $$");
    await admin.query('grant usage on schema public to propbrew_review_app'); await runMigrations({ url: testUrl });
    const url = new URL(testUrl!); url.username = 'propbrew_review_app';
    for (const [key, value] of Object.entries({ DATABASE_URL: url.toString(), DATA_SOURCE: 'postgres', PROPBREW_AUTH_MODE: 'company', PROPBREW_REVIEW_MODE: '0', NODE_ENV: 'production', BETTER_AUTH_URL: origin, NEXT_PUBLIC_SITE_URL: origin, BETTER_AUTH_SECRET: 'disposable-estate-setup-secret-at-least-32-characters', PROPBREW_AUTH_ORIGINS: '', REEVE_ALLOW_DEMO_IDENTITIES: '', NEXT_PUBLIC_DEV_IDENTITY: '' })) vi.stubEnv(key, value);
    owner = await signup('estate-owner'); other = await signup('estate-other'); member = await signup('estate-viewer');
    company = await provisionCompany(owner.identity, 'Synthetic Estate operating setup'); otherCompany = await provisionCompany(other.identity, 'Synthetic isolated Estate operator');
    await admin.query("insert into company_memberships(tenant_id,user_id,company_role,modules) values($1,$2,'member','{\"estate\":\"view\"}'::jsonb)", [company, member.identity.user.id]);
    await select(owner, company);
    const property = await addEstateProperty({ name: 'Synthetic Estate Court', address: '20 Synthetic Road, Lagos', unitCount: 2, unitType: 'Apartment', idempotencyKey: randomUUID() });
    expect(property.ok).toBe(true); if (!property.ok) throw new Error('Fixture property unavailable.'); siteId = property.id;
    unitId = (await snapshot(company)).payload.collections.units[0].id;
    const resident = await addEstateTenant({ name: 'Synthetic resident', unitId, moveInDate: '2026-01-01', household: 1, email: '', phone: '', idempotencyKey: randomUUID() });
    expect(resident.ok).toBe(true); if (!resident.ok) throw new Error('Fixture resident unavailable.'); residentId = resident.id;
  }, 30_000);
  afterAll(async () => {
    request.headers = new Headers();
    const globals = globalThis as typeof globalThis & { __propbrewAuthPool?: { pool: Pool }; __propbrewPgPool?: { pool: Pool }; __propbrewNativeAuth?: unknown };
    await globals.__propbrewAuthPool?.pool.end(); await globals.__propbrewPgPool?.pool.end(); delete globals.__propbrewAuthPool; delete globals.__propbrewPgPool; delete globals.__propbrewNativeAuth;
    vi.unstubAllEnvs(); await admin?.end();
  });

  it('creates an exact-money draft once, issues it and preserves another company', async () => {
    await select(owner, company); const foreign = await snapshot(otherCompany);
    const input = { ...binding(), residentId, expectedUnitId: unitId, description: 'Quarterly service charge', amount: '12500.50', dueDate: today() };
    const a = await createEstateInvoice(input), b = await createEstateInvoice(input); expect(a.ok).toBe(true); expect(b).toMatchObject({ ok: true, id: a.ok ? a.id : undefined });
    if (!a.ok) throw new Error('Invoice unavailable.');
    const invoice = (await snapshot(company)).payload.collections.invoices.find((row: { id: string }) => row.id === a.id);
    expect(invoice.amount).toEqual({ minor: 1250050, currency: 'NGN' }); expect(invoice.status).toBe('draft'); expect(invoice.paid.minor).toBe(0);
    expect(await issueEstateInvoice({ expectedCompanyId: company, invoiceId: a.id })).toMatchObject({ ok: true });
    expect((await snapshot(company)).payload.collections.invoices[0].status).toBe('issued'); expect(await snapshot(otherCompany)).toEqual(foreign);
  });
  it('generates recurring drafts idempotently through both manager and background processing', async () => {
    await select(owner, company);
    expect(await createEstateRecurringCharge({ ...binding(), residentId, expectedUnitId: unitId, description: 'Monthly cleaning levy', amount: '100.25', frequency: 'monthly', startDate: today(), endDate: null, dueOffsetDays: 7 })).toMatchObject({ ok: true });
    const [a, b] = await Promise.all([generateDueEstateCharges({ expectedCompanyId: company }), generateDueEstateCharges({ expectedCompanyId: company })]);
    expect(a.ok && b.ok).toBe(true); expect((a.ok ? a.created ?? 0 : 0) + (b.ok ? b.created ?? 0 : 0)).toBe(1);
    expect(await createEstateRecurringCharge({ ...binding(), residentId, expectedUnitId: unitId, description: 'Automatic waste levy', amount: '50.00', frequency: 'yearly', startDate: today(), endDate: null, dueOffsetDays: 0 })).toMatchObject({ ok: true });
    const automated = await runEstateRecurringSweep(); expect(automated.created).toBe(1); expect(automated.failed).toBe(0);
    const saved = await snapshot(company); const invoice = saved.payload.collections.invoices.find((row: { description: string }) => row.description.startsWith('Automatic waste levy'));
    expect(invoice.status).toBe('draft'); expect(invoice.paid.minor).toBe(0);
    expect(saved.payload.history[`${company}:service-charge:${invoice.id}`][0].actorRole).toBe('system_timer');
    expect((await runEstateRecurringSweep()).created).toBe(0); expect(await snapshot(company)).toEqual(saved);
    expect((await admin.query("select count(*)::int n from audit_events where tenant_id=$1 and action='estate.recurring.drafts_generated'", [company])).rows[0].n).toBe(1);
    const directory = await withAuthTransaction(owner.identity.user.id, async (client) => client.query('select * from estate_recurring_company_ids(null,100)'));
    expect(directory.rows).toHaveLength(0);
  });
  it('records an agreement with pending deposit and keeps stage changes separate from money', async () => {
    await select(owner, company);
    const input = { companyScope: company, residentId, expectedUnitId: unitId, startDate: '2026-01-01', endDate: '2027-01-01', rentAmount: '1200000.50', depositAmount: '100000', rentFrequency: 'yearly', agreementReference: 'SYNTHETIC-LEASE-1', notes: 'Synthetic agreement record only.', idempotencyKey: randomUUID() };
    const a = await createEstateTenancyAgreement(input); expect(a.ok).toBe(true); expect(await createEstateTenancyAgreement(input)).toEqual(a);
    if (!a.ok) throw new Error('Agreement unavailable.');
    for (const stage of ['applied', 'screening', 'approved']) expect(await advanceTenancy(a.id, stage)).toMatchObject({ ok: true });
    const tenancy = (await snapshot(company)).payload.collections.tenancies.find((row: { id: string }) => row.id === a.id);
    expect(tenancy.stage).toBe('moving_in'); expect(tenancy.depositStatus).toBe('pending'); expect(tenancy.rentMinor).toBe(120000050);
    expect(await createEstateTenancyAgreement({ ...input, idempotencyKey: randomUUID() })).toMatchObject({ ok: false });
  });
  it('configures a scoped amenity, enforces capacity, confirms free approval and protects reservations', async () => {
    await select(owner, company);
    const input = { ...binding(), siteId, name: 'Synthetic residents lounge', capacity: 1, feeMajor: '0', autoApprove: 'manual', openMinute: 0, closeMinute: 1440, durationMinutes: 60 };
    const created = await createEstateAmenity(input); expect(created.ok).toBe(true); expect(await createEstateAmenity(input)).toEqual(created);
    if (!created.ok) throw new Error('Amenity unavailable.');
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10), slotISO = `${tomorrow}T09:00:00.000Z`;
    const book = { ...binding(), amenityId: created.id, residentId, expectedUnitId: unitId, slotISO };
    const reserved = await createEstateAmenityBooking(book); expect(reserved.ok).toBe(true); expect(await createEstateAmenityBooking(book)).toEqual(reserved);
    expect(await createEstateAmenityBooking({ ...book, idempotencyKey: randomUUID() })).toMatchObject({ ok: false });
    if (!reserved.ok) throw new Error('Reservation unavailable.');
    expect(await transition('booking', reserved.id, 'APPROVE')).toMatchObject({ ok: true, to: 'confirmed' });
    expect(await archiveEstateAmenity({ ...binding(), id: created.id, revision: 1 })).toMatchObject({ ok: false });
    expect(await transition('booking', reserved.id, 'CANCEL')).toMatchObject({ ok: true, to: 'cancelled' });
    expect(await archiveEstateAmenity({ ...binding(), id: created.id, revision: 1 })).toMatchObject({ ok: true });
  });
  it('denies read-only accounts, stale company bindings and foreign records without partial saves', async () => {
    const before = await snapshot(company), foreign = await snapshot(otherCompany);
    await select(member, company);
    await expect(createEstateInvoice({ ...binding(), residentId, expectedUnitId: unitId, description: 'Forbidden levy', amount: '10', dueDate: today() })).rejects.toThrow();
    await expect(createEstateTenancyAgreement({ companyScope: company, residentId, expectedUnitId: unitId, startDate: '2028-01-01', endDate: '2029-01-01', rentAmount: '10', depositAmount: '0', rentFrequency: 'yearly', agreementReference: '', notes: '', idempotencyKey: randomUUID() })).rejects.toThrow();
    await select(other, otherCompany);
    const invoice = { expectedCompanyId: company, idempotencyKey: randomUUID(), residentId, expectedUnitId: unitId, description: 'Foreign levy', amount: '10', dueDate: today() };
    expect(await createEstateInvoice(invoice)).toMatchObject({ ok: false });
    expect(await createEstateInvoice({ ...invoice, expectedCompanyId: otherCompany })).toMatchObject({ ok: false });
    expect(await snapshot(company)).toEqual(before); expect(await snapshot(otherCompany)).toEqual(foreign);
  });
});

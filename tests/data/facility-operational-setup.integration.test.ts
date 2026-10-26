import { randomUUID } from 'node:crypto';
import { Client, type Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { runMigrations } from '../../scripts/migrate.mjs';
import { getNativeAuth } from '@/server/auth/auth';
import { activateCompany, provisionCompany, type NativeIdentity } from '@/server/auth/company';
import { withAuthTransaction } from '@/server/auth/database';
import { createFacilityAsset } from '@/server/actions/facility-registration';
import { createFacilitySite } from '@/server/actions/facility-site-setup';
import { createFacilityMaintenancePlan, recordFacilityRuntimeReading, recordFacilityService } from '@/server/actions/facility-maintenance-setup';
import { createFacilityPart, recordFacilityStockMovement } from '@/server/actions/facility-inventory';
import { createFacilityComplianceObligation } from '@/server/actions/facility-compliance';
import { scheduleInspection, runInspection } from '@/server/actions/inspections';
import { runFacilityMaintenanceSweep, stopFacilityMaintenanceWorker } from '@/server/jobs/facility-maintenance';
import { POST as uploadEvidence } from '@/app/api/facility/evidence/route';
import { GET as downloadEvidence } from '@/app/api/facility/evidence/[id]/route';

const request = vi.hoisted(() => ({ headers: new Headers() }));
vi.mock('next/headers', () => ({ headers: async () => request.headers }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

// Only the disposable loopback cluster is permitted. These are synthetic users,
// companies, assets and images; no configured application database is read.
const testUrl = process.env.PROPBREW_TEST_DATABASE_URL;
if (testUrl && !['localhost', '127.0.0.1', '[::1]'].includes(new URL(testUrl).hostname)) throw new Error('Facility operating tests require a disposable loopback database.');
const origin = 'https://facility-setup-integration.example';
const runId = randomUUID().slice(0, 8);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64');
function fullSizePng() {
  // A valid ancillary PNG text chunk exercises the actual 2 MB upload boundary
  // while retaining the tiny, synthetic image and a correctly calculated CRC.
  const data = Buffer.alloc(2 * 1024 * 1024 - png.length - 12, 97);
  data.write('Comment\0', 0, 'ascii');
  const body = Buffer.concat([Buffer.from('tEXt'), data]); let crc = 0xffffffff;
  for (const byte of body) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
  const size = Buffer.alloc(4), checksum = Buffer.alloc(4); size.writeUInt32BE(data.length); checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([png.subarray(0, -12), size, body, checksum, png.subarray(-12)]);
}
type Browser = { cookies: Map<string, string>; identity: NativeIdentity };
let admin: Client;
let owner: Browser, other: Browser, viewer: Browser, scoped: Browser;
let company: string, otherCompany: string, siteId: string, assetId: string, partId: string, evidenceId: string;
const cookieHeader = (browser: Pick<Browser, 'cookies'>) => [...browser.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
const requestAs = (browser: Pick<Browser, 'cookies'>) => { request.headers = new Headers({ origin, cookie: cookieHeader(browser) }); };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const scope = () => ({ expectedCompanyId: company, expectedSiteId: siteId, expectedUnitId: null, assetId });
const binding = () => ({ expectedCompanyId: company, idempotencyKey: randomUUID() });

async function http(browser: Pick<Browser, 'cookies'>, path: string, body?: Record<string, unknown>) {
  const headers = new Headers({ origin, 'x-forwarded-for': '127.0.0.48', cookie: cookieHeader(browser) });
  if (body) headers.set('content-type', 'application/json');
  const response = await getNativeAuth().handler(new Request(`${origin}/api/auth${path}`, { method: body ? 'POST' : 'GET', headers, body: body ? JSON.stringify(body) : undefined }));
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(';')[0], separator = pair.indexOf('='), name = pair.slice(0, separator), value = pair.slice(separator + 1);
    if (!value || /max-age=0(?:;|$)/i.test(cookie)) browser.cookies.delete(name); else browser.cookies.set(name, value);
  }
  return { response, data: await response.json() };
}
async function signup(label: string): Promise<Browser> {
  const browser = { cookies: new Map<string, string>() };
  const created = await http(browser, '/sign-up/email', { name: `Synthetic ${label}`, email: `${label}-${runId}@example.invalid`, password: 'Disposable-facility-passphrase-24!' });
  expect(created.response.status).toBe(200);
  return { ...browser, identity: (await http(browser, '/get-session')).data as NativeIdentity };
}
async function select(browser: Browser, id: string) {
  await activateCompany(browser.identity, id); browser.identity = (await http(browser, '/get-session')).data as NativeIdentity; requestAs(browser);
}
async function snapshot(id = company) { return (await admin.query('select version::text,payload from workspace_records where tenant_id=$1::uuid', [id])).rows[0]; }
async function rawEvidenceIds(browser: Browser, selectedCompany = company) {
  return withAuthTransaction(browser.identity.user.id, async (client) => {
    await client.query("select set_config('app.tenant_id',$1,true)", [selectedCompany]);
    return client.query('select id from facility_evidence_files where tenant_id=$1', [selectedCompany]);
  }, browser.identity.session.id);
}
async function upload(type: 'asset' | 'obligation', id: string, key = randomUUID(), bytes = png) {
  const form = new FormData(); form.set('expectedCompanyId', company); form.set('resourceType', type); form.set('resourceId', id);
  form.set('file', new File([bytes], 'synthetic-service-photo.png', { type: 'image/png' }));
  return uploadEvidence(new Request(`${origin}/api/facility/evidence`, { method: 'POST', headers: { origin, cookie: request.headers.get('cookie') ?? '', 'Idempotency-Key': key }, body: form }));
}
function planInput(title: string) {
  return { ...scope(), title, frequency: 'weekly', every: 1, basis: 'calendar', firstDue: today(), leadTimeDays: 0, estimatedHours: 1, runtimeIntervalHours: null, checklist: [{ label: 'Check generator filter', requiresPhoto: true }], evidenceRequired: true, autoGenerate: false, idempotencyKey: randomUUID() };
}
function partInput() {
  return { ...binding(), siteId, name: 'Generator filter', category: 'Generator consumable', sku: 'GEN-FILTER-01', location: 'Main store / A1', unitOfMeasure: 'each', reorderPoint: 3, usedPerMonth: 2, unitCostAmount: '0.29', openingStock: 10, openingReference: 'COUNT-001', openingReason: 'Physical count before rollout' };
}
function obligationInput(name: string) {
  return { ...binding(), siteId, assetId, name, scopeLabel: 'Generator bay', criticality: 'routine' as const, cadenceDays: 30, templateKey: 'general' as const, templateName: 'Generator operational check', checklist: [{ id: 'condition', label: 'Inspect fuel hose', severity: 'major' as const, requiresPhoto: true }], authority: '', certificateReference: 'CERT-SYNTHETIC', validUntil: addDays(today(), 365), nextDueDate: today() };
}
async function deny(operation: () => Promise<unknown>) {
  let result: unknown; try { result = await operation(); } catch { return; }
  expect(result).toMatchObject({ ok: false });
}

describe.skipIf(!testUrl)('Facility operations from an empty company with real sessions and PostgreSQL', () => {
  beforeAll(async () => {
    admin = new Client({ connectionString: testUrl }); await admin.connect();
    await admin.query("do $$ begin if not exists(select from pg_roles where rolname='propbrew_review_app') then create role propbrew_review_app login nosuperuser nocreatedb nocreaterole nobypassrls; end if; end $$");
    await admin.query('grant usage on schema public to propbrew_review_app'); await runMigrations({ url: testUrl });
    const url = new URL(testUrl!); url.username = 'propbrew_review_app';
    for (const [key, value] of Object.entries({ DATABASE_URL: url.toString(), DATA_SOURCE: 'postgres', PROPBREW_AUTH_MODE: 'company', PROPBREW_REVIEW_MODE: '0', NODE_ENV: 'production', BETTER_AUTH_URL: origin, NEXT_PUBLIC_SITE_URL: origin, BETTER_AUTH_SECRET: 'disposable-facility-setup-secret-at-least-32-characters', PROPBREW_AUTH_ORIGINS: '', REEVE_ALLOW_DEMO_IDENTITIES: '', NEXT_PUBLIC_DEV_IDENTITY: '' })) vi.stubEnv(key, value);
    owner = await signup('facility-owner'); other = await signup('facility-other'); viewer = await signup('facility-viewer'); scoped = await signup('facility-site-manager');
    company = await provisionCompany(owner.identity, 'Synthetic Facility operating setup'); otherCompany = await provisionCompany(other.identity, 'Synthetic isolated Facility company');
    await admin.query("update company_memberships set modules='{\"facility\":\"manage\"}'::jsonb,version=version+1 where tenant_id=$1 and user_id=$2", [company, owner.identity.user.id]);
    await admin.query("insert into company_memberships(tenant_id,user_id,company_role,modules) values($1,$2,'member','{\"facility\":\"view\"}'::jsonb)", [company, viewer.identity.user.id]);
    await select(owner, company);
    const property = await createFacilitySite({ ...binding(), name: 'Synthetic Facility Court', address: '40 Synthetic Road, Lagos' });
    expect(property.ok).toBe(true); if (!property.ok) throw new Error('Fixture site unavailable.'); siteId = property.id;
    const restricted = await createFacilitySite({ ...binding(), name: 'Synthetic assigned site', address: '41 Synthetic Road, Lagos' });
    expect(restricted.ok).toBe(true); if (!restricted.ok) throw new Error('Fixture assigned site unavailable.');
    await admin.query("insert into company_memberships(tenant_id,user_id,company_role,modules,all_estates,estate_ids) values($1,$2,'member','{\"facility\":\"manage\"}'::jsonb,false,$3::jsonb)", [company, scoped.identity.user.id, JSON.stringify([restricted.id])]);
    const asset = await createFacilityAsset({ siteId, name: 'Synthetic standby generator', category: 'Generator', serial: `SYNTHETIC-${runId}`, locationLabel: 'Generator bay', purchaseDate: '2025-01-01', warrantyExpiry: '2027-01-01', status: 'operational', idempotencyKey: randomUUID() });
    expect(asset.ok).toBe(true); if (!asset.ok) throw new Error('Fixture asset unavailable.'); assetId = asset.id;
    expect((await snapshot()).payload.collections.facilityParts).toEqual([]);
    expect((await snapshot()).payload.collections.ppmPlans).toEqual([]);
    expect((await snapshot()).payload.collections.complianceObligations).toEqual([]);
  }, 30_000);
  afterAll(async () => {
    vi.useRealTimers(); stopFacilityMaintenanceWorker(); request.headers = new Headers();
    const globals = globalThis as typeof globalThis & { __propbrewAuthPool?: { pool: Pool }; __propbrewPgPool?: { pool: Pool }; __propbrewNativeAuth?: unknown };
    await globals.__propbrewAuthPool?.pool.end(); await globals.__propbrewPgPool?.pool.end(); delete globals.__propbrewAuthPool; delete globals.__propbrewPgPool; delete globals.__propbrewNativeAuth;
    vi.unstubAllEnvs(); await admin?.end();
  });

  it('bootstraps real facility sites without Estate access or invented spaces and denies unassigned operators', async () => {
    await select(owner, company);
    expect((await admin.query('select modules from company_memberships where tenant_id=$1 and user_id=$2', [company, owner.identity.user.id])).rows[0].modules).toEqual({ facility: 'manage' });
    const saved = await snapshot();
    expect(saved.payload.collections.sites.find((row: { id: string }) => row.id === siteId)).toMatchObject({ kind: 'facility', name: 'Synthetic Facility Court' });
    expect(saved.payload.collections.units).toEqual([]); expect(saved.payload.collections.buildings).toEqual([]);
    for (const browser of [viewer, scoped]) {
      await select(browser, company);
      await deny(() => createFacilitySite({ ...binding(), name: 'Forbidden new site', address: '42 Synthetic Road, Lagos' }));
    }
    expect(await snapshot()).toEqual(saved);
  });
  it('stores real private image bytes once, downloads them and records auditable evidence', async () => {
    await select(owner, company); const key = randomUUID(), bytes = fullSizePng(); expect(bytes.length).toBe(2 * 1024 * 1024);
    const a = await upload('asset', assetId, key, bytes); expect(a.status).toBe(201); const first = await a.json(); evidenceId = first.file.id;
    const b = await upload('asset', assetId, key, bytes); expect(b.status).toBe(201); expect((await b.json()).file.id).toBe(evidenceId);
    const response = await downloadEvidence(new Request(`${origin}/api/facility/evidence/${evidenceId}`), { params: Promise.resolve({ id: evidenceId }) });
    expect(response.status).toBe(200); expect(response.headers.get('content-type')).toBe('image/png'); expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect((await admin.query('select count(*)::int n from facility_evidence_files where tenant_id=$1', [company])).rows[0].n).toBe(1);
    expect((await admin.query("select count(*)::int n from audit_events where tenant_id=$1 and action='facility.evidence.stored'", [company])).rows[0].n).toBe(1);
    expect((await rawEvidenceIds(owner)).rows).toEqual([{ id: evidenceId }]);
    const saved = await snapshot(); expect((await upload('asset', assetId, randomUUID(), Buffer.concat([bytes, Buffer.from([0])]))).status).toBe(413); expect(await snapshot()).toEqual(saved);
    // Two maximum-size multipart requests, a private byte-for-byte download and
    // a rejected oversized request use real PostgreSQL on shared CI runners.
  }, 15_000);
  it('records the actual service checklist and image once, advances its calendar and meters the next runtime cycle', async () => {
    await select(owner, company); const input = planInput('Weekly generator service');
    const created = await createFacilityMaintenancePlan(input); expect(created.ok).toBe(true); if (!created.ok) throw new Error('Maintenance plan unavailable.');
    expect(await createFacilityMaintenancePlan(input)).toMatchObject({ ok: true, id: created.id });
    let saved = (await snapshot()).payload;
    const plan = saved.collections.ppmPlans.find((row: { id: string }) => row.id === created.id);
    const occurrence = saved.collections.ppmOccurrences.find((row: { planId: string; status: string }) => row.planId === created.id && row.status !== 'completed');
    const service = { ...scope(), planId: created.id, occurrenceId: occurrence.id, expectedPlanVersion: 1, checkedIds: plan.checklist.map((row: { id: string }) => row.id), evidenceIds: [evidenceId], servicedOn: today(), runtimeAtService: null, notes: 'Filter inspected and recorded.', idempotencyKey: randomUUID() };
    const beforeInvalid = await snapshot(); expect(await recordFacilityService({ ...service, evidenceIds: [] })).toMatchObject({ ok: false }); expect(await snapshot()).toEqual(beforeInvalid);
    expect(await recordFacilityService(service)).toMatchObject({ ok: true }); expect(await recordFacilityService(service)).toMatchObject({ ok: true });
    saved = (await snapshot()).payload;
    expect(saved.auxiliary.facilityMaintenance.services.filter((row: { planId: string }) => row.planId === created.id)).toHaveLength(1);
    expect(saved.auxiliary.facilityMaintenance.services[0].evidence[0].id).toBe(evidenceId);
    expect(saved.collections.ppmPlans.find((row: { id: string }) => row.id === created.id).nextDue).toBe(addDays(today(), 7));
    expect(saved.collections.ppmOccurrences.find((row: { id: string }) => row.id === occurrence.id).status).toBe('completed');
    const runtimePlan = await createFacilityMaintenancePlan({ ...planInput('100-hour generator check'), basis: 'runtime', runtimeIntervalHours: 100, evidenceRequired: false, checklist: [{ label: 'Check engine oil', requiresPhoto: false }] });
    expect(runtimePlan.ok).toBe(true); if (!runtimePlan.ok) throw new Error('Runtime plan unavailable.');
    const meter = { ...scope(), readingHours: 100.25, expectedPreviousHours: 0, idempotencyKey: randomUUID() };
    expect(await recordFacilityRuntimeReading(meter)).toMatchObject({ ok: true }); expect(await recordFacilityRuntimeReading(meter)).toMatchObject({ ok: true });
    saved = (await snapshot()).payload;
    const runtimeOccurrence = saved.collections.ppmOccurrences.find((row: { planId: string; status: string }) => row.planId === runtimePlan.id && row.status !== 'completed');
    const runtimeChecklist = saved.collections.ppmPlans.find((row: { id: string }) => row.id === runtimePlan.id).checklist;
    expect(runtimeOccurrence.basisWon).toBe('runtime');
    expect(await recordFacilityService({ ...scope(), planId: runtimePlan.id, occurrenceId: runtimeOccurrence.id, expectedPlanVersion: 1, checkedIds: runtimeChecklist.map((row: { id: string }) => row.id), evidenceIds: [], servicedOn: today(), runtimeAtService: 100.25, notes: '', idempotencyKey: randomUUID() })).toMatchObject({ ok: true });
    const nextMeter = { ...scope(), readingHours: 200.25, expectedPreviousHours: 100.25, idempotencyKey: randomUUID() };
    expect(await recordFacilityRuntimeReading(nextMeter)).toMatchObject({ ok: true });
    saved = (await snapshot()).payload;
    expect(saved.collections.ppmOccurrences.filter((row: { planId: string; status: string }) => row.planId === runtimePlan.id && row.status !== 'completed')).toHaveLength(1);
    const latest = await snapshot(); expect(await recordFacilityRuntimeReading({ ...nextMeter, idempotencyKey: randomUUID(), readingHours: 199 })).toMatchObject({ ok: false }); expect(await snapshot()).toEqual(latest);
  });
  it('persists opening, receipt, issue and counted adjustment with exact kobo and no duplicate movement', async () => {
    await select(owner, company); const input = partInput(), created = await createFacilityPart(input);
    expect(created.ok).toBe(true); if (!created.ok) throw new Error('Part unavailable.'); partId = created.id;
    expect(await createFacilityPart(input)).toEqual(created);
    let expectedVersion = 1, expectedStock = 10;
    for (const operation of [{ kind: 'receipt', quantity: 5, next: 15 }, { kind: 'issue', quantity: 4, next: 11 }, { kind: 'adjustment', countedStock: 2, next: 2 }] as const) {
      const { next, ...movement } = operation;
      const form = { ...binding(), partId, expectedVersion, expectedStock, reference: `SYNTHETIC-${operation.kind}`, reason: 'Verified physical stock movement', ...movement };
      expect(await recordFacilityStockMovement(form)).toMatchObject({ ok: true, stock: next });
      expect(await recordFacilityStockMovement(form)).toMatchObject({ ok: true, stock: next }); expectedVersion++; expectedStock = next;
    }
    const saved = await snapshot(), part = saved.payload.collections.facilityParts.find((row: { id: string }) => row.id === partId);
    expect(part.unitCost).toEqual({ minor: 29, currency: 'NGN' }); expect(part.stock).toBe(2); expect(part.reorderPoint).toBe(3);
    expect(saved.payload.auxiliary.facilityInventory.movements.filter((row: { partId: string }) => row.partId === partId).map((row: { delta: number; unitCostMinor: number }) => [row.delta, row.unitCostMinor])).toEqual([[10, 29], [5, 29], [-4, 29], [-9, 29]]);
    expect(await recordFacilityStockMovement({ ...binding(), partId, expectedVersion, expectedStock, kind: 'issue', quantity: 3, reason: 'Would exceed physical balance', reference: 'REJECT-1' })).toMatchObject({ ok: false });
    expect(await snapshot()).toEqual(saved);
  });
  it('schedules actual checklist snapshots, creates a failure work order and preserves certificate expiry after a pass', async () => {
    await select(owner, company);
    for (const outcome of ['fail', 'pass'] as const) {
      const input = obligationInput(`Generator ${outcome} obligation`), created = await createFacilityComplianceObligation(input);
      expect(created.ok).toBe(true); if (!created.ok || !created.id) throw new Error('Obligation unavailable.'); expect(await createFacilityComplianceObligation(input)).toEqual(created);
      const uploaded = await upload('obligation', created.id); expect(uploaded.status).toBe(201); const fileId = (await uploaded.json()).file.id;
      const schedule = { expectedCompanyId: company, obligationId: created.id, expectedObligationVersion: 1, date: today(), inspector: 'Synthetic site inspector', idempotencyKey: randomUUID() };
      const planned = await scheduleInspection(schedule); expect(planned.ok).toBe(true); if (!planned.ok || !planned.id) throw new Error('Inspection unavailable.'); expect(await scheduleInspection(schedule)).toEqual(planned);
      const operation = (await snapshot()).payload.auxiliary.facilityCompliance.runs.find((row: { inspectionId: string }) => row.inspectionId === planned.id);
      const form = { expectedCompanyId: company, idempotencyKey: randomUUID(), expectedVersion: operation.version, expectedChecklistHash: operation.checklistHash, evidenceIds: [fileId], photoCount: 0, results: [{ itemId: 'condition', result: outcome, note: outcome === 'fail' ? 'Fuel hose has a visible crack.' : '' }] };
      const before = await snapshot(); expect(await runInspection(planned.id, { ...form, evidenceIds: [] })).toMatchObject({ ok: false }); expect(await snapshot()).toEqual(before);
      const result = await runInspection(planned.id, form); expect(result).toMatchObject({ ok: true, passed: outcome === 'pass', raised: outcome === 'fail' ? 1 : 0 }); expect(await runInspection(planned.id, form)).toEqual(result);
      const saved = (await snapshot()).payload, inspection = saved.collections.inspections.find((row: { id: string }) => row.id === planned.id);
      expect(inspection.status).toBe(outcome === 'pass' ? 'passed' : 'failed');
      expect(saved.collections.complianceObligations.find((row: { id: string }) => row.id === created.id).validUntil).toBe(input.validUntil);
      if (outcome === 'pass') expect(saved.auxiliary.facilityCompliance.configurations.find((row: { obligationId: string }) => row.obligationId === created.id).nextOperationalDue).toBe(addDays(today(), 30));
      else expect(saved.collections.workOrders.find((row: { ref: string }) => row.ref === inspection.raisedWorkOrderRefs[0])).toMatchObject({ siteId, assetId, origin: 'failed_inspection', status: 'new', priority: 'high' });
    }
  });
  it('runs the real automatic scheduler once without exposing its company directory to signed-in users', async () => {
    await select(owner, company); const tomorrow = addDays(today(), 1);
    const result = await createFacilityMaintenancePlan({ ...planInput('Automatically due tomorrow'), firstDue: tomorrow, autoGenerate: true, evidenceRequired: false, checklist: [{ label: 'Check coolant level', requiresPhoto: false }] });
    expect(result.ok).toBe(true); if (!result.ok) throw new Error('Automatic plan unavailable.');
    expect((await snapshot()).payload.collections.ppmOccurrences.find((row: { planId: string }) => row.planId === result.id).workOrderRef).toBeFalsy();
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(`${tomorrow}T10:00:00+01:00`));
    try {
      const sweep = await runFacilityMaintenanceSweep(); expect(sweep.failed).toBe(0); expect(sweep.created).toBe(1);
      const saved = await snapshot(), occurrence = saved.payload.collections.ppmOccurrences.find((row: { planId: string }) => row.planId === result.id);
      expect(occurrence.workOrderRef).toMatch(/^WO-/); expect(saved.payload.collections.workOrders.find((row: { ref: string }) => row.ref === occurrence.workOrderRef)).toMatchObject({ origin: 'ppm_schedule', status: 'new' });
      expect(saved.payload.history[`${company}:work-order:${saved.payload.collections.workOrders.find((row: { ref: string }) => row.ref === occurrence.workOrderRef).id}`][0].actorRole).toBe('system_timer');
      expect((await runFacilityMaintenanceSweep()).created).toBe(0); expect(await snapshot()).toEqual(saved);
      expect((await admin.query("select count(*)::int n from audit_events where tenant_id=$1 and action='facility.maintenance.scheduled'", [company])).rows[0].n).toBe(1);
      const directory = await withAuthTransaction(owner.identity.user.id, (client) => client.query('select * from facility_maintenance_company_ids(null,100)'), owner.identity.session.id);
      expect(directory.rows).toHaveLength(0);
    } finally { vi.useRealTimers(); }
  });
  it('rolls back file bytes, metadata and workspace changes if the durable evidence audit cannot be recorded', async () => {
    await select(owner, company); const saved = await snapshot(), fileCount = (await admin.query('select count(*)::int n from facility_evidence_files where tenant_id=$1', [company])).rows[0].n;
    await admin.query(`create function facility_test_reject_audit() returns trigger language plpgsql as $$ begin if new.tenant_id='${company}'::uuid and new.action='facility.evidence.stored' then raise exception 'synthetic audit failure'; end if; return new; end $$`);
    await admin.query('create trigger facility_test_reject_audit before insert on audit_events for each row execute function facility_test_reject_audit()');
    try { expect((await upload('asset', assetId)).status).toBe(503); }
    finally { await admin.query('drop trigger facility_test_reject_audit on audit_events'); await admin.query('drop function facility_test_reject_audit()'); }
    expect(await snapshot()).toEqual(saved); expect((await admin.query('select count(*)::int n from facility_evidence_files where tenant_id=$1', [company])).rows[0].n).toBe(fileCount);
  });
  it('denies viewer, unassigned-site and foreign-company changes and file reads without partial writes', async () => {
    const saved = await snapshot(), foreign = await snapshot(otherCompany);
    for (const browser of [viewer, scoped]) {
      await select(browser, company);
      await deny(() => createFacilityPart({ ...partInput(), sku: `DENIED-${browser.identity.user.id}` }));
      await deny(() => recordFacilityStockMovement({ ...binding(), partId, expectedVersion: 4, expectedStock: 2, kind: 'receipt', quantity: 1, reason: 'Forbidden movement', reference: 'DENIED' }));
      await deny(() => createFacilityMaintenancePlan(planInput('Forbidden maintenance plan')));
      await deny(() => createFacilityComplianceObligation(obligationInput('Forbidden obligation')));
      expect((await upload('asset', assetId)).status).toBe(browser === scoped ? 404 : 403);
      // RLS must enforce the site restriction even when bypassing application
      // reads and presenting an otherwise valid user, company and session.
      if (browser === scoped) expect((await rawEvidenceIds(browser)).rows).toHaveLength(0);
    }
    await select(other, otherCompany);
    expect(await createFacilityPart(partInput())).toMatchObject({ ok: false });
    expect(await createFacilityPart({ ...partInput(), expectedCompanyId: otherCompany })).toMatchObject({ ok: false });
    expect(await recordFacilityRuntimeReading({ ...scope(), expectedCompanyId: otherCompany, readingHours: 300, expectedPreviousHours: 200.25, idempotencyKey: randomUUID() })).toMatchObject({ ok: false });
    const response = await downloadEvidence(new Request(`${origin}/api/facility/evidence/${evidenceId}`), { params: Promise.resolve({ id: evidenceId }) }); expect(response.status).toBe(404);
    expect((await rawEvidenceIds(other)).rows).toHaveLength(0);
    expect(await snapshot()).toEqual(saved); expect(await snapshot(otherCompany)).toEqual(foreign);
  });
});

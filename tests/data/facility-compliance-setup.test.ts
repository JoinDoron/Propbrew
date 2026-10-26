import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember, type CompanyModuleGrants } from '@/lib/auth/company-policy';
import { blankCompanyWorkspaceState, db, getHistory } from '@/server/data/store';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import type { CompanyPrincipal } from '@/server/auth/company';
import type { Asset, Site } from '@/domain/entities';
import type { ComplianceObligationInput, FacilityComplianceState } from '@/domain/facility/compliance';
import type { FacilityEvidence } from '@/domain/facility/evidence';
import { facilityComplianceSetup, facilityComplianceHistory, facilityInspectionOperation } from '@/server/reads/facility-compliance';

const boundary = vi.hoisted(() => ({ getActor: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.getActor }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { createFacilityComplianceObligation, updateFacilityComplianceObligation } from '@/server/actions/facility-compliance';
import { runInspection, scheduleInspection, rescheduleInspection } from '@/server/actions/inspections';

const tenantId = '50dab7ae-f75b-42b5-8cca-ea9f00a47092', userId = '533d192f-8388-48de-be98-ef07d114ae50';
const siteId = 'facility-location-a', otherSiteId = 'facility-location-b', assetId = 'facility-generator';
let state: WorkspaceRecordState;
function run<T>(fn: () => T, modules: CompanyModuleGrants = { facility: 'manage' }, estates?: string[], mode: 'read' | 'write' = 'write') {
  const membership = { membershipId: 'verified-compliance-member', userId, companyId: tenantId, companyRole: 'member' as const, status: 'active' as const, companyStatus: 'active' as const, estateIds: estates ?? [], allEstates: estates === undefined, modules };
  const actor = actorForCompanyMember(membership, userId)!;
  boundary.getActor.mockResolvedValue(actor);
  const principal: CompanyPrincipal = { actor, user: { id: userId, name: 'Verified compliance operator', email: 'operator@example.invalid' }, session: { id: randomUUID() }, company: { id: tenantId, name: 'Compliance test company' }, sandbox: undefined, membership: { ...membership, version: '1' } };
  return runWithRecordContext({ state, domainTenantId: tenantId, mode, companyPrincipal: principal }, () => fn());
}
const sidecar = () => state.auxiliary.facilityCompliance as FacilityComplianceState;
const row = (id: string) => run(() => db.complianceObligations.find((value) => value.id === id)!);
const inspection = (id: string) => run(() => db.inspections.find((value) => value.id === id)!);
function input(overrides: Partial<ComplianceObligationInput> = {}): ComplianceObligationInput {
  return { expectedCompanyId: tenantId, idempotencyKey: randomUUID(), siteId, assetId, name: 'Generator safety review', scopeLabel: 'Operator text must not replace actual asset', criticality: 'important', cadenceDays: 30, templateKey: 'general', templateName: 'Generator operational inspection', checklist: [{ id: 'visual', label: 'Inspect fuel connection', severity: 'critical', requiresPhoto: false }, { id: 'running', label: 'Review operating condition', severity: 'major', requiresPhoto: false }], authority: 'Recorded responsible authority', certificateReference: 'CERT-RECORD-001', validUntil: '2026-11-01', nextDueDate: '2026-10-25', ...overrides };
}
async function create(overrides: Partial<ComplianceObligationInput> = {}) {
  const result = await run(() => createFacilityComplianceObligation(input(overrides)));
  expect(result.ok).toBe(true); if (!result.ok || !result.id) throw new Error('Creation failed'); return result.id;
}
function edit(id: string, overrides: Partial<ComplianceObligationInput> = {}) {
  const saved = row(id), config = sidecar().configurations.find((value) => value.obligationId === id)!;
  return { ...input({ name: saved.name, siteId: String(saved.siteId), assetId: saved.assetId ? String(saved.assetId) : null, scopeLabel: saved.scopeLabel, criticality: saved.criticality, cadenceDays: saved.cadenceDays, templateKey: saved.templateKey, templateName: config.templateName, checklist: config.checklist, authority: saved.authority ?? '', certificateReference: config.certificateReference, validUntil: saved.validUntil, nextDueDate: config.nextOperationalDue ?? undefined, ...overrides }), obligationId: id, expectedVersion: config.version };
}
async function schedule(id: string) {
  const result = await run(() => scheduleInspection({ obligationId: id, date: '2026-10-25', inspector: 'Contractor label', expectedCompanyId: tenantId, idempotencyKey: randomUUID(), expectedObligationVersion: sidecar().configurations.find((value) => value.obligationId === id)!.version }));
  expect(result.ok).toBe(true); if (!result.ok || !result.id) throw new Error('Scheduling failed'); return result.id;
}
function completion(id: string) {
  const current = inspection(id), op = sidecar().runs.find((value) => value.inspectionId === id)!;
  return { results: current.checklist.map((item) => ({ itemId: item.id, result: 'pass' as const })), photoCount: 0, expectedCompanyId: tenantId, idempotencyKey: randomUUID(), expectedVersion: op.version, expectedChecklistHash: op.checklistHash, evidenceIds: [] as string[] };
}
function savedFile(obligationId: string, change: Partial<FacilityEvidence> = {}): string {
  const id = randomUUID(), file: FacilityEvidence = { id, tenantId, siteId, resourceType: 'obligation', resourceId: obligationId, name: 'actual-saved-evidence.png', contentType: 'image/png', size: 67, kind: 'image', url: `/api/facility/evidence/${id}`, sha256: '0'.repeat(64), createdAt: '2026-10-24T23:30:00.000Z', createdBy: userId, ...change };
  const registry = state.auxiliary.facilityEvidence as { files: FacilityEvidence[]; receipts: unknown[] } | undefined;
  if (registry) registry.files.push(file); else state.auxiliary.facilityEvidence = { files: [file], receipts: [] };
  return id;
}
beforeEach(() => {
  vi.stubEnv('PROPBREW_AUTH_MODE', 'company'); vi.stubEnv('PROPBREW_REVIEW_MODE', '0'); vi.stubEnv('DATA_SOURCE', 'postgres');
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T23:30:00.000Z')); vi.clearAllMocks(); state = blankCompanyWorkspaceState();
  run(() => {
    for (const id of [siteId, otherSiteId]) db.sites.push({ tenantId, id, kind: 'facility', name: id === siteId ? 'Main Facility' : 'Second Facility', address: 'Synthetic Lagos location', buildingCount: 1, unitCount: 1 } as unknown as Site);
    state.collections.assets = [{ tenantId, id: assetId, siteId, name: 'Actual generator', category: 'Power', status: 'operational', archivedAt: null } as unknown as Asset];
  });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('company Facility compliance configuration', () => {
  it('reads an empty company without seeding records or creating auxiliary state', () => {
    const before = structuredClone(state);
    expect(run(() => facilityComplianceHistory(awaitActor()), undefined, undefined, 'read')).toEqual([]);
    expect(run(() => facilityComplianceSetup(awaitActor()), undefined, undefined, 'read')).toMatchObject({ companyId: tenantId, sites: [{ id: siteId }, { id: otherSiteId }], assets: [{ id: assetId, siteId }] });
    expect(state).toEqual(before);
  });
  it('binds an obligation to the actual authorised asset, with operator-recorded expiry and one retry receipt', async () => {
    const request = input(), first = await run(() => createFacilityComplianceObligation(request));
    expect(first).toMatchObject({ ok: true, id: expect.any(String) }); expect(await run(() => createFacilityComplianceObligation(request))).toEqual(first);
    expect(run(() => db.complianceObligations)).toHaveLength(1);
    expect(run(() => db.complianceObligations[0])).toMatchObject({ tenantId, siteId, estateId: siteId, assetId, scopeLabel: 'Actual generator', validUntil: '2026-11-01' });
    expect(sidecar().configurations[0]).toMatchObject({ version: 1, checklist: request.checklist, certificateReference: 'CERT-RECORD-001', nextOperationalDue: '2026-10-25' });
    expect(sidecar().audit[0].note).toContain('not independently verified'); expect(sidecar().receipts).toHaveLength(1);
    expect(await run(() => createFacilityComplianceObligation({ ...request, name: 'Changed submission' }))).toMatchObject({ ok: false });
  });
  it.each(['company', 'site', 'asset-site', 'archived', 'foreign-asset', 'unassigned'] as const)('rejects %s scope and stale bindings without records', async (kind) => {
    let request = input();
    if (kind === 'company') request = input({ expectedCompanyId: randomUUID() });
    if (kind === 'site') request = input({ siteId: 'missing-site' });
    if (kind === 'asset-site') request = input({ siteId: otherSiteId });
    if (kind === 'archived') (state.collections.assets as Asset[])[0].archivedAt = '2026-10-01T00:00:00Z' as Asset['archivedAt'];
    if (kind === 'foreign-asset') state.collections.assets = (state.collections.assets as Asset[]).map((asset) => ({ ...asset, tenantId: randomUUID() as Asset['tenantId'] }));
    expect(await run(() => createFacilityComplianceObligation(request), undefined, kind === 'unassigned' ? [otherSiteId] : undefined)).toMatchObject({ ok: false });
    expect(run(() => db.complianceObligations)).toHaveLength(0);
  });
  it.each([{ facility: 'view' }, { estate: 'manage' }, { facility: 'view', estate: 'manage' }] as CompanyModuleGrants[])('denies non-managers before writes for grants %j', async (grants) => {
    await expect(run(() => createFacilityComplianceObligation(input()), grants)).rejects.toThrow('cannot perform');
    expect(run(() => db.complianceObligations)).toHaveLength(0);
  });
  it('edits only the expected version and idempotently replays, keeping recorded certificate changes explicit', async () => {
    const id = await create(), update = edit(id, { validUntil: '2027-01-15', certificateReference: 'EXTERNAL-RENEWAL-REF' });
    expect(await run(() => updateFacilityComplianceObligation(update))).toMatchObject({ ok: true });
    expect(await run(() => updateFacilityComplianceObligation(update))).toMatchObject({ ok: true });
    expect(row(id).validUntil).toBe('2027-01-15'); expect(sidecar().configurations[0].version).toBe(2);
    expect(await run(() => updateFacilityComplianceObligation({ ...update, idempotencyKey: randomUUID() }))).toMatchObject({ ok: false, error: expect.stringContaining('another tab') });
    expect(sidecar().audit).toHaveLength(2);
  });
  it('blocks moving a configured obligation while its inspection is open', async () => {
    const id = await create(); await schedule(id);
    expect(await run(() => updateFacilityComplianceObligation(edit(id, { siteId: otherSiteId, assetId: null, scopeLabel: 'Second area' })))).toMatchObject({ ok: false, error: expect.stringContaining('open inspection') });
    expect(row(id).siteId).toBe(siteId);
  });
});

describe('native inspection scheduling and execution', () => {
  it('snapshots the configured checklist, rejects duplicate open runs and reschedules with version and date checks', async () => {
    const id = await create(), request = { obligationId: id, date: '2026-10-25', inspector: 'Inspector label', expectedCompanyId: tenantId, idempotencyKey: randomUUID(), expectedObligationVersion: 1 };
    const result = await run(() => scheduleInspection(request)); expect(result).toMatchObject({ ok: true });
    expect(await run(() => scheduleInspection(request))).toEqual(result);
    expect(await run(() => scheduleInspection({ ...request, idempotencyKey: randomUUID() }))).toMatchObject({ ok: false, error: expect.stringContaining('open inspection') });
    const saved = run(() => db.inspections[0]), binding = { expectedCompanyId: tenantId, idempotencyKey: randomUUID(), expectedVersion: 1, expectedDate: '2026-10-25' };
    expect(saved.checklist.map((item) => item.label)).toEqual(input().checklist.map((item) => item.label));
    expect(await run(() => rescheduleInspection(saved.id, '2026-10-27', binding))).toMatchObject({ ok: true });
    expect(await run(() => rescheduleInspection(saved.id, '2026-10-27', binding))).toMatchObject({ ok: true });
    expect(await run(() => rescheduleInspection(saved.id, '2026-10-28', { ...binding, idempotencyKey: randomUUID() }))).toMatchObject({ ok: false });
    expect(saved.scheduledDate).toBe('2026-10-27'); expect(sidecar().runs[0].version).toBe(2);
    expect(await run(() => runInspection(saved.id, { ...completion(saved.id), expectedVersion: 1 }))).toMatchObject({ ok: false });
  });
  it('keeps the certificate expiry intact and advances only the operational date using the captured cadence and current WAT day', async () => {
    const id = await create(), runId = await schedule(id), staleEditor = edit(id);
    expect(await run(() => updateFacilityComplianceObligation(edit(id, { cadenceDays: 90 })))).toMatchObject({ ok: true });
    const request = completion(runId), result = await run(() => runInspection(runId, request));
    expect(result).toMatchObject({ ok: true, passed: true, raised: 0 }); expect(await run(() => runInspection(runId, request))).toEqual(result);
    expect(inspection(runId)).toMatchObject({ completedDate: '2026-10-25', status: 'passed' }); expect(row(id).validUntil).toBe('2026-11-01');
    expect(sidecar().configurations[0]).toMatchObject({ nextOperationalDue: '2026-11-24', version: 3 });
    expect(sidecar().runs[0]).toMatchObject({ cadenceDays: 30, version: 2, completedAt: '2026-10-24T23:30:00.000Z' });
    expect(await run(() => updateFacilityComplianceObligation(staleEditor))).toMatchObject({ ok: false });
    expect(await run(() => rescheduleInspection(runId, '2026-10-30', { expectedCompanyId: tenantId, idempotencyKey: randomUUID(), expectedVersion: 2, expectedDate: '2026-10-25' }))).toMatchObject({ ok: false });
  });
  it('requires recorded findings and creates one durable, correctly attributed follow-up per failed item on retry', async () => {
    const id = await create(), runId = await schedule(id), request = completion(runId);
    const failed = { ...request, results: request.results.map((item, index) => ({ ...item, result: index === 0 ? 'fail' as const : 'pass' as const, note: index === 0 ? 'Fuel connection is leaking' : undefined })) };
    expect(await run(() => runInspection(runId, { ...failed, results: failed.results.map((item) => ({ ...item, note: '' })) }))).toMatchObject({ ok: false, error: expect.stringContaining('finding') });
    const result = await run(() => runInspection(runId, failed)); expect(result).toMatchObject({ ok: true, raised: 1, passed: false });
    expect(await run(() => runInspection(runId, failed))).toEqual(result);
    const workOrders = run(() => db.workOrders); expect(workOrders).toHaveLength(1);
    expect(workOrders[0]).toMatchObject({ tenantId, siteId, estateId: siteId, assetId, status: 'new', priority: 'emergency', description: 'Fuel connection is leaking', origin: 'failed_inspection', requesterUserId: userId, requesterName: 'Verified compliance operator' });
    expect(run(() => getHistory('work-order', workOrders[0].id))).toHaveLength(1);
    expect(sidecar().configurations[0].nextOperationalDue).toBe('2026-10-25'); expect(row(id).validUntil).toBe('2026-11-01');
    expect(await run(() => runInspection(runId, { ...failed, results: request.results }))).toMatchObject({ ok: false });
  });
  it('uses only scoped saved image references for photo requirements, rejecting claimed counts, documents and foreign files', async () => {
    const id = await create({ checklist: [{ id: 'photo', label: 'Inspect visible condition', severity: 'minor', requiresPhoto: true }] }), runId = await schedule(id), request = completion(runId);
    expect(await run(() => runInspection(runId, { ...request, photoCount: 1 }))).toMatchObject({ ok: false, error: expect.stringContaining('claimed photo count') });
    expect(await run(() => runInspection(runId, request))).toMatchObject({ ok: false, error: expect.stringContaining('actual saved image') });
    const document = savedFile(id, { kind: 'document', contentType: 'application/pdf' });
    const foreign = savedFile(id, { tenantId: randomUUID() }), otherObligation = savedFile('different-obligation'), otherLocation = savedFile(id, { siteId: otherSiteId });
    for (const file of [document, foreign, otherObligation, otherLocation]) expect(await run(() => runInspection(runId, { ...request, evidenceIds: [file] }))).toMatchObject({ ok: false });
    const image = savedFile(id);
    expect(await run(() => runInspection(runId, { ...request, evidenceIds: [image, image] }))).toMatchObject({ ok: false });
    expect(await run(() => runInspection(runId, { ...request, evidenceIds: [image] }))).toMatchObject({ ok: true, passed: true });
    expect(sidecar().runs[0].evidenceIds).toEqual([image]);
  });
  it('rejects missing, duplicate, unknown and entirely not-applicable results', async () => {
    const id = await create(), runId = await schedule(id), request = completion(runId);
    for (const results of [request.results.slice(0, 1), [request.results[0], request.results[0]], [{ ...request.results[0], itemId: 'unknown' }, request.results[1]], request.results.map((item) => ({ ...item, result: 'na' as const, note: 'Not present on this asset' }))]) expect(await run(() => runInspection(runId, { ...request, results }))).toMatchObject({ ok: false });
    expect(inspection(runId).status).toBe('scheduled'); expect(run(() => db.workOrders)).toHaveLength(0);
  });
  it.each(['company', 'obligation-site', 'inspection-site', 'date', 'checklist', 'assigned-site'] as const)('rejects %s changes at completion', async (kind) => {
    const id = await create(), runId = await schedule(id), request = completion(runId);
    if (kind === 'company') request.expectedCompanyId = randomUUID();
    if (kind === 'obligation-site') row(id).siteId = otherSiteId as Site['id'];
    if (kind === 'inspection-site') inspection(runId).siteId = otherSiteId as Site['id'];
    if (kind === 'date') inspection(runId).scheduledDate = '2026-10-29';
    if (kind === 'checklist') inspection(runId).checklist = inspection(runId).checklist.map((item, index) => ({ ...item, label: index === 0 ? 'Changed check requirement' : item.label }));
    expect(await run(() => runInspection(runId, request), undefined, kind === 'assigned-site' ? [otherSiteId] : undefined)).toMatchObject({ ok: false });
    expect(inspection(runId).completedDate).toBeUndefined(); expect(run(() => db.workOrders)).toHaveLength(0);
  });
  it('requires new native scheduling bindings and never applies the legacy photo-count interface', async () => {
    const id = await create(); expect(await run(() => scheduleInspection({ obligationId: id, date: '2026-10-25', inspector: 'Inspector' }))).toMatchObject({ ok: false });
    const runId = await schedule(id); expect(await run(() => runInspection(runId, { results: completion(runId).results, photoCount: 1 }))).toMatchObject({ ok: false });
    expect(run(() => facilityInspectionOperation(awaitActor(), runId))).toMatchObject({ version: 1 });
  });
});

function awaitActor() {
  return actorForCompanyMember({ membershipId: 'verified-compliance-member', userId, companyId: tenantId, companyRole: 'member', status: 'active', companyStatus: 'active', estateIds: [], allEstates: true, modules: { facility: 'manage' } }, userId)!;
}

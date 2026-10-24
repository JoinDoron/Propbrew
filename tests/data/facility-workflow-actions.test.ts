import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { identityByKey } from '@/server/identities';
import { repos } from '@/server/data';
import { db, getHistory } from '@/server/data/store';

const boundary = vi.hoisted(() => ({ getActor: vi.fn(), revalidatePath: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.getActor }));
vi.mock('next/cache', () => ({ revalidatePath: boundary.revalidatePath }));

import { fireWoTransition } from '@/server/actions/work-orders';
import { checkInVisitor, checkOutVisitor, logMeterReading, logRefuel, preRegisterVisitor, receiveStock, setCopilotModel, setEstateLockdown } from '@/server/actions/facility';
import { completePpmOccurrence, decidePpmSuggestion, generatePpmWorkOrder, logRuntimeReading, reschedulePpmOccurrence } from '@/server/actions/ppm';
import { rescheduleInspection, runInspection, scheduleInspection } from '@/server/actions/inspections';
import { facilityAssignees } from '@/server/facility-guards';
import { getTenantModel } from '@/server/copilot/metering';

const initial = structuredClone(db);
const manager = identityByKey('facility_manager').actor;
const technician = identityByKey('technician').actor;
const gardens = String(technician.estateIds[0]);
const currentOrder = () => db.workOrders.find((row) => row.tenantId === manager.tenantId && String(row.siteId) === gardens)!;
const scheduledInspection = () => db.inspections.find((row) => row.tenantId === manager.tenantId && row.status === 'scheduled')!;
const occurrence = () => db.ppmOccurrences.find((row) => row.tenantId === manager.tenantId && String(row.assetId) === 'ast-gen-d' && row.status !== 'completed')!;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(db, structuredClone(initial));
  boundary.getActor.mockResolvedValue(manager);
});
afterEach(() => { Object.assign(db, structuredClone(initial)); vi.unstubAllEnvs(); });

describe('atomic, eligible work-order assignment', () => {
  it.each([undefined, '', 'Unknown contractor', 'Folake Bello', 'SecureNet Systems'])('rejects an ineligible assignee (%s) without a partial status, owner or audit write', async (assignee) => {
    const row = currentOrder(); row.status = 'triaged';
    const before = structuredClone(row), historyCount = getHistory('work-order', row.id).length;
    expect(await fireWoTransition(row.ref, 'ASSIGN', { assignee })).toMatchObject({ ok: false });
    expect(row).toEqual(before);
    expect(getHistory('work-order', row.id)).toHaveLength(historyCount);
    expect(boundary.revalidatePath).not.toHaveBeenCalled();
  });

  it('routes an accepted assignment to the technician scope and rejects a no-op reassignment', async () => {
    const row = currentOrder(); row.status = 'triaged'; row.assigneeUserId = undefined; row.vendorOrgId = undefined;
    expect(await fireWoTransition(row.ref, 'ASSIGN', { assignee: 'Emeka Nwosu' })).toEqual({ ok: true, to: 'assigned' });
    expect(repos.workOrders.getByRef(technician, row.ref)?.assigneeUserId).toBe(technician.userId);
    const before = structuredClone(row);
    expect(await fireWoTransition(row.ref, 'REASSIGN', { assignee: 'Emeka Nwosu' })).toMatchObject({ ok: false });
    expect(row).toEqual(before);
    expect(facilityAssignees(manager.tenantId, gardens).some((person) => person.assigneeName === 'SecureNet Systems')).toBe(false);
  });

  it('excludes suspended or out-of-site technicians from offered and accepted assignments', async () => {
    const user = db.users.find((row) => row.id === technician.userId)!;
    user.status = 'suspended';
    expect(facilityAssignees(manager.tenantId, gardens).some((person) => person.assigneeUserId === user.id)).toBe(false);
    user.status = 'active'; user.estateIds = [];
    const row = currentOrder(); row.status = 'triaged';
    expect(await fireWoTransition(row.ref, 'ASSIGN', { assignee: user.name })).toMatchObject({ ok: false });
    expect(row.status).toBe('triaged');
  });
});

describe('Facility numeric inputs and visit lifecycle', () => {
  it.each([NaN, Infinity, -Infinity])('rejects non-finite readings (%s) without corrupting the source records', async (value) => {
    const generator = db.facilityGenerators[0], meter = db.facilityMeters[0], part = db.facilityParts[0], runtime = db.assetRuntime.find((row) => row.tenantId === manager.tenantId)!;
    const before = structuredClone({ generator, meter, part, runtime });
    for (const result of [await logRefuel(generator.id, value), await logMeterReading(meter.id, value), await receiveStock(part.id, value), await logRuntimeReading(String(runtime.assetId), value)]) expect(result).toMatchObject({ ok: false });
    expect({ generator, meter, part, runtime }).toEqual(before);
  });

  it('records whole stock quantities exactly and rejects fractional no-op receipts', async () => {
    const part = db.facilityParts[0], before = part.stock;
    expect(await receiveStock(part.id, .1)).toMatchObject({ ok: false });
    expect(part.stock).toBe(before);
    expect(await receiveStock(part.id, 2)).toEqual({ ok: true });
    expect(part.stock).toBe(before + 2);
  });

  it('preserves view-only Facility permissions', async () => {
    boundary.getActor.mockResolvedValue(identityByKey('estate_manager').actor);
    const generator = db.facilityGenerators[0], before = structuredClone(generator);
    expect(await logRefuel(generator.id, 10)).toMatchObject({ ok: false });
    expect(generator).toEqual(before);
  });

  it('allows an expected visitor through check-in/check-out only once per transition', async () => {
    const pass = db.visitorPasses.find((row) => row.status === 'expected')!;
    const count = db.accessEvents.length;
    expect(await checkInVisitor(pass.id)).toMatchObject({ ok: true });
    expect(await checkInVisitor(pass.id)).toMatchObject({ ok: false });
    expect(db.accessEvents).toHaveLength(count + 1);
    expect(await checkOutVisitor(pass.id)).toMatchObject({ ok: true });
    expect(await checkOutVisitor(pass.id)).toMatchObject({ ok: false });
    expect(db.accessEvents).toHaveLength(count + 2);
  });

  it('does not check in denied, expired or not-yet-valid passes', async () => {
    const denied = db.visitorPasses.find((row) => row.status === 'denied')!;
    const expected = db.visitorPasses.find((row) => row.status === 'expected')!;
    const count = db.accessEvents.length;
    expect(await checkInVisitor(denied.id)).toMatchObject({ ok: false });
    expected.validToISO = '2026-07-25';
    expect(await checkInVisitor(expected.id)).toMatchObject({ ok: false });
    expected.validFromISO = '2026-07-27'; expected.validToISO = '2026-07-28';
    expect(await checkInVisitor(expected.id)).toMatchObject({ ok: false });
    expect(db.accessEvents).toHaveLength(count);
  });

  it('validates pass expiry and derives its site from the authorised repository', async () => {
    const input = { visitorName: 'Review visitor', kind: 'guest' as const, hostName: 'Manager', hostUnit: 'Reception', purpose: 'Review visit' };
    const count = db.visitorPasses.length;
    for (const date of ['bad-date', '2026-02-30', '2026-07-25']) expect(await preRegisterVisitor({ ...input, validToISO: date })).toMatchObject({ ok: false });
    expect(db.visitorPasses).toHaveLength(count);
    expect(await preRegisterVisitor({ ...input, validToISO: '2026-07-27' })).toMatchObject({ ok: true });
    expect(repos.sites.list(manager).items.some((site) => site.id === db.visitorPasses[0].siteId)).toBe(true);
  });

  it('changes only scoped access points even if another tenant reuses an id', async () => {
    const point = db.accessPoints[0];
    const foreign = { ...structuredClone(point), tenantId: 'foreign-review-tenant' as typeof point.tenantId, mode: 'secured' as const };
    db.accessPoints.push(foreign);
    expect(await setEstateLockdown(true)).toEqual({ ok: true });
    expect(point.mode).toBe('lockdown'); expect(foreign.mode).toBe('secured');
  });
});

describe('tenant Copilot model configuration', () => {
  it('retains the working OpenAI selection when an unconnected Anthropic model is chosen', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'unit-test-openai-connection');
    for (const field of ['ANTHROPIC_API_KEY', 'AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', 'VERCEL']) vi.stubEnv(field, '');
    boundary.getActor.mockResolvedValue(identityByKey('estate_manager').actor);
    expect(await setCopilotModel('gpt-6.1-sol')).toEqual({ ok: true });
    expect(await setCopilotModel('claude-sonnet-5')).toMatchObject({ ok: false, error: expect.stringContaining('not connected') });
    expect(getTenantModel(manager.tenantId!)).toBe('gpt-6.1-sol');
  });
});

describe('maintenance generation and completion guards', () => {
  it('generates a technician-visible work order once and reuses its occurrence link after closure', async () => {
    const occ = occurrence();
    db.workOrders = db.workOrders.filter((row) => row.origin !== 'ppm_schedule' || row.assetId !== occ.assetId);
    const count = db.workOrders.length;
    const result = await generatePpmWorkOrder(occ.id);
    expect(result).toMatchObject({ ok: true });
    if (!result.ok) throw new Error(result.error);
    expect(repos.workOrders.getByRef(technician, result.ref!)?.assigneeUserId).toBe(technician.userId);
    const generated = db.workOrders.find((row) => row.ref === result.ref)!; generated.status = 'closed';
    expect(await generatePpmWorkOrder(occ.id)).toEqual(result);
    expect(db.workOrders).toHaveLength(count + 1);
  });

  it('does not reuse another tenant’s open maintenance job for the same asset id', async () => {
    const occ = occurrence();
    db.workOrders = db.workOrders.filter((row) => row.origin !== 'ppm_schedule' || row.assetId !== occ.assetId);
    db.workOrders.unshift({ ...currentOrder(), id: 'foreign-ppm' as typeof db.workOrders[number]['id'], ref: 'FOREIGN-PPM', tenantId: 'foreign-review-tenant' as typeof db.workOrders[number]['tenantId'], assetId: occ.assetId, origin: 'ppm_schedule', status: 'new' });
    expect(await generatePpmWorkOrder(occ.id)).not.toEqual({ ok: true, ref: 'FOREIGN-PPM' });
    expect(occ.workOrderRef).not.toBe('FOREIGN-PPM');
  });

  it('refuses invalid dates and completed occurrence reopening without altering the schedule', async () => {
    const occ = occurrence(), before = structuredClone(occ);
    for (const date of ['bad-date', '2026-02-30']) expect(await reschedulePpmOccurrence(occ.id, date)).toMatchObject({ ok: false });
    expect(occ).toEqual(before);
    occ.status = 'completed';
    for (const result of [await generatePpmWorkOrder(occ.id), await completePpmOccurrence(occ.id, { checkedIds: [], photoCount: 1 }), await reschedulePpmOccurrence(occ.id, '2026-08-10')]) expect(result).toMatchObject({ ok: false });
    expect(occ.status).toBe('completed');
  });

  it('cannot bypass a statutory deadline through suggestion approval', async () => {
    const plan = db.ppmPlans.find((row) => row.tenantId === manager.tenantId && row.statutory)!;
    const before = structuredClone(plan);
    expect(await decidePpmSuggestion(String(plan.assetId), 'approve', { date: '2026-08-16', confidence: .9 })).toMatchObject({ ok: false });
    expect(plan).toEqual(before);
    expect(await decidePpmSuggestion(String(plan.assetId), 'approve', { date: '2026-08-01', confidence: NaN })).toMatchObject({ ok: false });
  });
});

describe('inspection result integrity', () => {
  it('completes an inspection once and never duplicates its failed-item work orders on replay', async () => {
    const inspection = scheduledInspection();
    const results = inspection.checklist.map((item, index) => ({ itemId: item.id, result: index ? 'pass' as const : 'fail' as const }));
    expect(await runInspection(inspection.id, { results, photoCount: 1 })).toEqual({ ok: true, raised: 1, passed: false });
    const before = structuredClone({ inspection, orders: db.workOrders });
    expect(await runInspection(inspection.id, { results, photoCount: 1 })).toMatchObject({ ok: false });
    expect({ inspection, orders: db.workOrders }).toEqual(before);
    expect(await rescheduleInspection(inspection.id, '2026-08-02')).toMatchObject({ ok: false });
    expect(inspection.status).toBe('failed');
  });

  it('rejects invalid result enums, duplicates, all-N/A runs and invalid evidence before renewing compliance', async () => {
    const inspection = scheduledInspection();
    const pass = inspection.checklist.map((item) => ({ itemId: item.id, result: 'pass' as const }));
    const before = structuredClone({ inspection, orders: db.workOrders, obligations: db.complianceObligations });
    for (const input of [
      { results: pass.map((row) => ({ ...row, result: 'unknown' as 'pass' })), photoCount: 1 },
      { results: [...pass, pass[0]], photoCount: 1 },
      { results: pass.map((row) => ({ ...row, result: 'na' as const })), photoCount: 0 },
      { results: pass, photoCount: NaN },
    ]) expect(await runInspection(inspection.id, input)).toMatchObject({ ok: false });
    expect({ inspection, orders: db.workOrders, obligations: db.complianceObligations }).toEqual(before);
  });

  it('validates scheduled dates instead of accepting rolled-over calendar dates', async () => {
    const inspection = scheduledInspection();
    const count = db.inspections.length, before = structuredClone(inspection);
    expect(await scheduleInspection({ obligationId: inspection.obligationId, date: '2026-02-30', inspector: 'Review inspector' })).toMatchObject({ ok: false });
    expect(await rescheduleInspection(inspection.id, 'not-a-date')).toMatchObject({ ok: false });
    expect(db.inspections).toHaveLength(count); expect(inspection).toEqual(before);
  });
});

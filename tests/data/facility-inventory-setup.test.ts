import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { actorForCompanyMember, type CompanyModuleGrants } from '@/lib/auth/company-policy';
import { runWithRecordContext, type WorkspaceRecordState } from '@/server/data/record-context';
import { createDemoWorkspaceState } from '@/server/data/demo-state';
import { db } from '@/server/data/store';
import type { CompanyPrincipal } from '@/server/auth/company';
import { facilityInventoryState, facilityPartSnapshot } from '@/domain/facility/inventory-setup';
import { listFacilityInventory } from '@/server/reads/facility-inventory';

const boundary = vi.hoisted(() => ({ getActor: vi.fn(), getSession: vi.fn(), requireWorkspace: vi.fn() }));
vi.mock('@/server/session', () => ({ getActor: boundary.getActor, getSession: boundary.getSession }));
vi.mock('@/server/workspaces', () => ({ requireWorkspace: boundary.requireWorkspace }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
import { createFacilityPart, updateFacilityPart, recordFacilityStockMovement, archiveFacilityPart } from '@/server/actions/facility-inventory';
const tenantId = '2a6a42a6-cf85-41af-a942-4b5eed3cd037', userId = '5bfef2eb-8304-44bb-883b-62b31624d5f2';
let state: WorkspaceRecordState;
const manager: CompanyModuleGrants = { facility: 'manage' };
function run<T>(fn: () => T, modules = manager, estateIds?: string[]) {
  const membership = { membershipId: 'verified-inventory-member', userId, companyId: tenantId, companyRole: 'member' as const, status: 'active' as const, companyStatus: 'active' as const, estateIds: estateIds ?? [], allEstates: estateIds === undefined, modules };
  const actor = actorForCompanyMember(membership, userId)!;
  boundary.getActor.mockResolvedValue(actor); boundary.requireWorkspace.mockResolvedValue({ actor, key: 'company', label: 'QA stock operator' });
  const principal: CompanyPrincipal = { actor, user: { id: userId, name: 'QA stock operator', email: 'operator@example.invalid' }, session: { id: randomUUID() }, company: { id: tenantId, name: 'QA company' }, sandbox: undefined, membership: { ...membership, version: '1' } };
  return runWithRecordContext({ state, domainTenantId: tenantId, mode: 'write', companyPrincipal: principal }, fn);
}
const data = () => facilityInventoryState(state, tenantId);
const siteId = () => run(() => String(db.sites.find((site) => site.kind === 'estate')!.id));
const input = () => ({ expectedCompanyId: tenantId, idempotencyKey: randomUUID(), siteId: siteId(), name: 'Generator fuel filter', category: 'Generator consumables', sku: 'QA-FILTER-001', location: 'Main store · Bin A', unitOfMeasure: 'pieces', reorderPoint: 3, usedPerMonth: 2, unitCostAmount: '0.29', openingStock: 5, openingReference: 'COUNT-001', openingReason: 'Verified opening physical count' });
async function create(value = input()) { const result = await run(() => createFacilityPart(value)); expect(result.ok).toBe(true); if (!result.ok) throw new Error(result.error); return run(() => db.facilityParts.find((part) => part.id === result.id)!); }
function move(partId: string, kind: 'receipt' | 'issue' | 'adjustment', quantity = 1) {
  const part = run(() => db.facilityParts.find((row) => row.id === partId)!), meta = data().parts.find((row) => row.partId === partId)!;
  return { expectedCompanyId: tenantId, idempotencyKey: randomUUID(), partId, expectedVersion: meta.version, expectedStock: part.stock, kind, reference: 'JOB-001', reason: 'Verified physical movement', ...(kind === 'adjustment' ? { countedStock: quantity } : { quantity }) };
}
function edit(partId: string) {
  const part = run(() => db.facilityParts.find((row) => row.id === partId)!), meta = data().parts.find((row) => row.partId === partId);
  return { expectedCompanyId: tenantId, idempotencyKey: randomUUID(), id: part.id, expectedVersion: meta?.version ?? null, expectedStock: part.stock, expectedSnapshot: facilityPartSnapshot(part), siteId: part.siteId ?? siteId(), name: part.name, category: part.category, sku: part.sku, location: part.location, unitOfMeasure: meta?.unitOfMeasure ?? 'pieces', reorderPoint: part.reorderPoint, usedPerMonth: part.usedPerMonth, unitCostAmount: (part.unitCost.minor / 100).toFixed(2), ...(!meta ? { openingReference: 'BASELINE-1', openingReason: 'Reviewed historical physical stock balance' } : {}) };
}
beforeEach(() => { vi.stubEnv('PROPBREW_AUTH_MODE', 'company'); vi.stubEnv('PROPBREW_REVIEW_MODE', '0'); vi.stubEnv('DATA_SOURCE', 'postgres'); state = createDemoWorkspaceState(tenantId); vi.clearAllMocks(); });
afterEach(() => vi.unstubAllEnvs());

describe('Facility inventory setup and movement integrity', () => {
  it('does not create a ledger while reading existing parts', async () => {
    const before = structuredClone(state);
    expect((await run(async () => listFacilityInventory(await boundary.getActor()))).parts.length).toBeGreaterThan(0);
    expect(state).toEqual(before);
  });
  it('creates a scoped part with exact cost and one idempotent opening movement', async () => {
    const value = input(), first = await run(() => createFacilityPart(value)); expect(first).toMatchObject({ ok: true, stock: 5 });
    expect(await run(() => createFacilityPart(value))).toEqual(first);
    expect(data().parts).toHaveLength(1); expect(data().movements).toHaveLength(1);
    expect(data().movements[0]).toMatchObject({ kind: 'opening', tenantId, siteId: value.siteId, stockBefore: 0, stockAfter: 5, delta: 5, unitCostMinor: 29, reference: 'COUNT-001' });
    expect(await run(() => createFacilityPart({ ...value, openingStock: 8 }))).toMatchObject({ ok: false });
  });
  it('rejects duplicate case-folded SKUs, foreign locations, extra authority and malformed counts', async () => {
    await create(); const base = input();
    for (const change of [{ sku: 'qa-filter-001' }, { siteId: 'foreign' }, { tenantId: 'foreign' }, { openingStock: -1 }, { openingStock: 0.5 }, { unitCostAmount: '0.001' }, { usedPerMonth: -1 }]) expect(await run(() => createFacilityPart({ ...base, ...change }))).toMatchObject({ ok: false });
    expect(data().parts).toHaveLength(1);
  });
  it('records receipt, issue and physical count adjustment without negative stock or duplicate replay', async () => {
    const part = await create(), receipt = move(part.id, 'receipt', 4), first = await run(() => recordFacilityStockMovement(receipt)); expect(first).toMatchObject({ ok: true, stock: 9 });
    expect(await run(() => recordFacilityStockMovement(receipt))).toEqual(first);
    expect(await run(() => recordFacilityStockMovement(move(part.id, 'issue', 3)))).toMatchObject({ ok: true, stock: 6 });
    expect(await run(() => recordFacilityStockMovement(move(part.id, 'adjustment', 2)))).toMatchObject({ ok: true, stock: 2 });
    expect(data().movements.map((row) => [row.kind, row.stockBefore, row.stockAfter])).toEqual([['opening', 0, 5], ['receipt', 5, 9], ['issue', 9, 6], ['adjustment', 6, 2]]);
    expect(await run(() => recordFacilityStockMovement(move(part.id, 'issue', 3)))).toMatchObject({ ok: false }); expect(part.stock).toBe(2);
  });
  it('rejects stale counts and missing movement evidence without changing stock', async () => {
    const part = await create(), stale = move(part.id, 'receipt', 1);
    expect(await run(() => recordFacilityStockMovement({ ...stale, idempotencyKey: randomUUID() }))).toMatchObject({ ok: true });
    expect(await run(() => recordFacilityStockMovement(stale))).toMatchObject({ ok: false });
    expect(await run(() => recordFacilityStockMovement({ ...move(part.id, 'receipt'), reason: '', reference: '' }))).toMatchObject({ ok: false });
    expect(part.stock).toBe(6); expect(data().movements).toHaveLength(2);
  });
  it('edits master details with a snapshot guard while fixing site and stocking unit', async () => {
    const part = await create(), value = edit(part.id);
    expect(await run(() => updateFacilityPart({ ...value, name: 'Corrected filter', unitCostAmount: '12.05' }))).toMatchObject({ ok: true });
    expect(await run(() => updateFacilityPart({ ...value, idempotencyKey: randomUUID(), name: 'Stale name' }))).toMatchObject({ ok: false });
    expect(await run(() => updateFacilityPart({ ...edit(part.id), unitOfMeasure: 'litres' }))).toMatchObject({ ok: false });
    expect(await run(() => updateFacilityPart({ ...edit(part.id), siteId: 'other' }))).toMatchObject({ ok: false });
    expect(part.stock).toBe(5); expect(part.unitCost.minor).toBe(1205); expect(data().movements[0].unitCostMinor).toBe(29);
  });
  it('lets only company-wide managers adopt unscoped historical stock with an explicit site and baseline', async () => {
    const legacy = run(() => db.facilityParts[0]), before = legacy.stock, value = edit(legacy.id);
    expect(await run(() => updateFacilityPart(value), manager, [siteId()])).toMatchObject({ ok: false });
    expect(await run(() => updateFacilityPart(value))).toMatchObject({ ok: true, stock: before });
    expect(data().movements[0]).toMatchObject({ kind: 'opening', stockBefore: 0, stockAfter: before, reference: 'BASELINE-1' });
    expect(legacy.siteId).toBe(value.siteId);
  });
  it('rejects a stale company form, module viewers and foreign site assignments', async () => {
    const value = input(); expect(await run(() => createFacilityPart({ ...value, expectedCompanyId: 'foreign-company' }))).toMatchObject({ ok: false });
    await expect(run(() => createFacilityPart(value), { facility: 'view' })).rejects.toThrow('cannot perform');
    expect(await run(() => createFacilityPart(value), manager, ['unassigned-site'])).toMatchObject({ ok: false });
    expect(data().parts).toHaveLength(0);
  });
  it('archives only zero-stock items and keeps their movement history', async () => {
    const part = await create(); const archive = () => ({ expectedCompanyId: tenantId, idempotencyKey: randomUUID(), id: part.id, expectedVersion: data().parts[0].version, expectedStock: part.stock });
    expect(await run(() => archiveFacilityPart(archive()))).toMatchObject({ ok: false });
    expect(await run(() => recordFacilityStockMovement(move(part.id, 'issue', 5)))).toMatchObject({ ok: true });
    expect(await run(() => archiveFacilityPart(archive()))).toMatchObject({ ok: true });
    expect(await run(() => recordFacilityStockMovement(move(part.id, 'receipt', 1)))).toMatchObject({ ok: false });
    expect(data().movements).toHaveLength(2); expect(data().parts[0].status).toBe('archived');
  });
  it('limits movement reads, scopes historical stock and supplies a stable older cursor', async () => {
    const part = await create(); await run(() => recordFacilityStockMovement(move(part.id, 'receipt', 1)));
    const page = await run(async () => listFacilityInventory(await boundary.getActor(), { limit: 1, partId: part.id }));
    expect(page.movements).toHaveLength(1); expect(page.nextBefore).toBeTruthy();
    const older = await run(async () => listFacilityInventory(await boundary.getActor(), { limit: 1, before: page.nextBefore!, partId: part.id }));
    expect(older.movements).toHaveLength(1); expect(older.movements[0].id).not.toBe(page.movements[0].id);
    const assigned = await run(async () => listFacilityInventory(await boundary.getActor()), manager, [siteId()]);
    expect(assigned.parts.every((row) => row.siteId === siteId())).toBe(true); expect(assigned.parts.some((row) => row.metadata === null)).toBe(false);
  });
});

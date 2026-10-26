'use server';

import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { assertCan, matchesScope, type Actor, type Action } from '@/lib/authz';
import { requireWorkspace } from '@/server/workspaces';
import { currentRecordContext } from '@/server/data/record-context';
import { withDurableMutation } from '@/server/data/durable-records';
import { db } from '@/server/data/store';
import { operatingNowISO } from '@/server/operating-clock';
import { facilityPartFields, inventoryKobo, inventoryQuantity, inventoryText, facilityInventoryState, facilityPartSnapshot, inventoryValuation, type FacilityInventoryState, type FacilityInventoryResult, type FacilityStockMovement } from '@/domain/facility/inventory-setup';
import type { Part } from '@/domain/facility';
import { asId, type TenantId } from '@/domain/ids';

const binding = { expectedCompanyId: inventoryText(1, 160), idempotencyKey: z.uuid() };
const countEvidence = { reference: inventoryText(2, 120), reason: inventoryText(3, 500) };
const createSchema = facilityPartFields.extend({ ...binding, openingStock: inventoryQuantity, openingReference: countEvidence.reference, openingReason: countEvidence.reason });
const editSchema = facilityPartFields.extend({ ...binding, id: inventoryText(1, 160), expectedVersion: z.number().int().positive().nullable(), expectedStock: inventoryQuantity, expectedSnapshot: z.string().min(1).max(1200), openingReference: countEvidence.reference.optional(), openingReason: countEvidence.reason.optional() });
const movementBinding = { ...binding, partId: inventoryText(1, 160), expectedVersion: z.number().int().positive(), expectedStock: inventoryQuantity, ...countEvidence };
const movementSchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...movementBinding, kind: z.literal('receipt'), quantity: inventoryQuantity.refine((value) => value > 0) }),
  z.strictObject({ ...movementBinding, kind: z.literal('issue'), quantity: inventoryQuantity.refine((value) => value > 0) }),
  z.strictObject({ ...movementBinding, kind: z.literal('adjustment'), countedStock: inventoryQuantity }),
]);
const archiveSchema = z.strictObject({ ...binding, id: inventoryText(1, 160), expectedVersion: z.number().int().positive(), expectedStock: inventoryQuantity });
const inventoryNowISO = () => new Date(operatingNowISO()).toISOString();
const refresh = () => ['/inventory', '/facility', '/portfolio', '/reports', '/copilot'].forEach((path) => revalidatePath(path));
function fail(error: unknown): FacilityInventoryResult {
  const message = error instanceof Error ? error.message : '';
  return { ok: false, error: /^(Your company|Choose an authorised|This part|This stock|Record an opening|Inventory valuation|An item|Site assignments|Archived parts|Only zero|Enter a positive|The counted|Not enough)/.test(message) ? message : 'This inventory change could not be saved. Check your access and reopen the latest record.' };
}
async function context(expectedCompanyId: string, action: Action) {
  const session = await requireWorkspace('facility'), actor = session.actor, scope = assertCan(actor, 'assets_ppm', action), records = currentRecordContext();
  if (!actor.tenantId || actor.tenantId !== expectedCompanyId || !records || records.mode !== 'write' || records.domainTenantId !== actor.tenantId) throw new Error('Your company changed. Reopen Inventory in the company you want to update.');
  return { actor, scope, state: records.state, data: facilityInventoryState(records.state, actor.tenantId, true), actorName: records.companyPrincipal?.user.name ?? session.label };
}
function replay(data: FacilityInventoryState, actor: Actor, key: string, operation: string, payload: unknown) {
  const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  const prior = data.receipts.find((row) => row.actorId === actor.userId && row.key === key);
  if (prior && (prior.hash !== hash || prior.operation !== operation)) throw new Error('This stock submission key was already used for different details. Reopen the form.');
  return { hash, prior };
}
function checkedPart(actor: Actor, id: string, scope: ReturnType<typeof assertCan>) {
  const part = db.facilityParts.find((row) => row.id === id && row.tenantId === actor.tenantId && (row.siteId ? matchesScope(row, scope) : actor.allEstates));
  if (!part) throw new Error('This part is unavailable in your assigned site scope.');
  return part;
}
function assertValue(parts: readonly Part[]) { const valuation = inventoryValuation(parts); if (valuation.review) throw new Error('Inventory valuation exceeds the supported exact range or a historical amount needs review. No change was saved.'); }
function mutationResult(data: FacilityInventoryState, actor: Actor, idempotencyKey: string, operation: string, hash: string, part: Part, action: string, movementId?: string): FacilityInventoryResult {
  const result = { ok: true as const, id: part.id, name: part.name, stock: part.stock, ...(movementId ? { movementId } : {}) };
  data.receipts.push({ actorId: actor.userId, key: idempotencyKey, operation, hash, result });
  data.audit.push({ tenantId: actor.tenantId!, actorId: actor.userId, action, entityId: part.id, at: inventoryNowISO() });
  refresh(); return result;
}
function movement(data: FacilityInventoryState, actor: Actor, actorName: string, part: Part, kind: FacilityStockMovement['kind'], before: number, after: number, reason: string, reference: string) {
  const row: FacilityStockMovement = { id: randomUUID(), tenantId: actor.tenantId!, partId: part.id, siteId: part.siteId!, kind, delta: after - before, quantity: Math.abs(after - before), stockBefore: before, stockAfter: after, unitCostMinor: part.unitCost.minor, currency: 'NGN', reason, reference, at: inventoryNowISO(), actorId: actor.userId, actorName };
  data.movements.push(row); return row.id;
}

export async function createFacilityPart(input: unknown): Promise<FacilityInventoryResult> {
  return withDurableMutation(async () => {
    const parsed = createSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Enter part details, whole stock quantities, a non-negative NGN unit cost and opening-count evidence.' };
    try {
      const value = parsed.data, { actor, scope, state, data, actorName } = await context(value.expectedCompanyId, 'create');
      const { idempotencyKey, openingStock, openingReason, openingReference, unitOfMeasure, unitCostAmount } = value;
      const fields = { siteId: value.siteId, name: value.name, category: value.category, sku: value.sku, location: value.location, reorderPoint: value.reorderPoint, usedPerMonth: value.usedPerMonth };
      const receipt = replay(data, actor, idempotencyKey, 'part.create', { ...value, idempotencyKey: undefined }); if (receipt.prior) return receipt.prior.result;
      const site = db.sites.find((row) => row.id === fields.siteId && matchesScope({ ...row, siteId: row.id }, scope));
      if (!site) throw new Error('Choose an authorised property or facility location.');
      if (db.facilityParts.some((row) => row.tenantId === actor.tenantId && row.sku.trim().toLocaleLowerCase('en') === fields.sku.toLocaleLowerCase('en'))) throw new Error('An item with this SKU already exists in this company.');
      if (data.parts.length >= 10_000) throw new Error('This part register has reached its 10,000-item limit.');
      const at = inventoryNowISO(), id = `part-${randomUUID()}`;
      const part = { ...fields, id, tenantId: asId<TenantId>(actor.tenantId!), siteId: site.id, stock: openingStock, unitCost: { minor: inventoryKobo(unitCostAmount)!, currency: 'NGN' } } as Part;
      assertValue([...(state.collections.facilityParts as Part[]).filter((row) => row.tenantId === actor.tenantId), part]);
      db.facilityParts.push(part);
      data.parts.push({ tenantId: actor.tenantId!, partId: id, siteId: String(site.id), unitOfMeasure, status: 'active', version: 1, createdAt: at, createdBy: actor.userId, updatedAt: at, updatedBy: actor.userId });
      const movementId = movement(data, actor, actorName, part, 'opening', 0, openingStock, openingReason, openingReference);
      return mutationResult(data, actor, idempotencyKey, 'part.create', receipt.hash, part, 'part.created', movementId);
    } catch (error) { return fail(error); }
  }, 'facility');
}

export async function updateFacilityPart(input: unknown): Promise<FacilityInventoryResult> {
  return withDurableMutation(async () => {
    const parsed = editSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Enter valid part details and reopen the current stock record before saving.' };
    try {
      const value = parsed.data, { actor, scope, state, data, actorName } = await context(value.expectedCompanyId, 'update');
      const receipt = replay(data, actor, value.idempotencyKey, 'part.update', { ...value, idempotencyKey: undefined }); if (receipt.prior) return receipt.prior.result;
      const part = checkedPart(actor, value.id, scope), meta = data.parts.find((row) => row.partId === part.id);
      if (part.unitCost.currency !== 'NGN') throw new Error('This part uses another cost currency. A reviewed currency migration is required before editing.');
      if (meta && meta.unitOfMeasure !== value.unitOfMeasure) throw new Error('This part’s stocking unit is fixed after registration. A reviewed unit conversion is required.');
      if (meta?.status === 'archived') throw new Error('Archived parts cannot be edited or reactivated. Create a separate item if required.');
      if ((meta?.version ?? null) !== value.expectedVersion || part.stock !== value.expectedStock || facilityPartSnapshot(part) !== value.expectedSnapshot) throw new Error('This part changed in another tab. Reopen its latest details.');
      if (meta && meta.siteId !== value.siteId) throw new Error('Site assignments are fixed for managed parts. Stock transfers need a separate reviewed workflow.');
      if (!meta && ((!part.siteId && !actor.allEstates) || !value.openingReason || !value.openingReference)) throw new Error('Record an opening baseline and site with a company-wide manager before updating this historical part.');
      if (!meta && part.siteId && part.siteId !== value.siteId) throw new Error('Site assignments are fixed for parts with a recorded location.');
      const site = db.sites.find((row) => row.id === value.siteId && matchesScope({ ...row, siteId: row.id }, scope));
      if (!site) throw new Error('Choose an authorised property or facility location.');
      if (db.facilityParts.some((row) => row.tenantId === actor.tenantId && row.id !== part.id && row.sku.trim().toLocaleLowerCase('en') === value.sku.toLocaleLowerCase('en'))) throw new Error('An item with this SKU already exists in this company.');
      const details = { name: value.name, category: value.category, sku: value.sku, location: value.location, reorderPoint: value.reorderPoint, usedPerMonth: value.usedPerMonth, siteId: site.id, unitCost: { minor: inventoryKobo(value.unitCostAmount)!, currency: 'NGN' as const } };
      assertValue((state.collections.facilityParts as Part[]).filter((row) => row.tenantId === actor.tenantId).map((row) => row.id === part.id ? { ...row, ...details } as Part : row));
      if (!meta && data.parts.length >= 10_000) throw new Error('This part register has reached its 10,000-item limit.');
      Object.assign(part, details);
      const at = inventoryNowISO(); let movementId: string | undefined;
      if (meta) { meta.unitOfMeasure = value.unitOfMeasure; meta.version++; meta.updatedAt = at; meta.updatedBy = actor.userId; }
      else {
        data.parts.push({ tenantId: actor.tenantId!, partId: part.id, siteId: String(site.id), unitOfMeasure: value.unitOfMeasure, status: 'active', version: 1, createdAt: at, createdBy: actor.userId, updatedAt: at, updatedBy: actor.userId });
        movementId = movement(data, actor, actorName, part, 'opening', 0, part.stock, value.openingReason!, value.openingReference!);
      }
      return mutationResult(data, actor, value.idempotencyKey, 'part.update', receipt.hash, part, meta ? 'part.updated' : 'part.baseline_registered', movementId);
    } catch (error) { return fail(error); }
  }, 'facility');
}

export async function recordFacilityStockMovement(input: unknown): Promise<FacilityInventoryResult> {
  return withDurableMutation(async () => {
    const parsed = movementSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Choose receipt, issue or counted-stock adjustment, a whole quantity, reason and reference.' };
    try {
      const value = parsed.data, { actor, scope, state, data, actorName } = await context(value.expectedCompanyId, 'update');
      const receipt = replay(data, actor, value.idempotencyKey, 'stock.movement', { ...value, idempotencyKey: undefined }); if (receipt.prior) return receipt.prior.result;
      const part = checkedPart(actor, value.partId, scope), meta = data.parts.find((row) => row.partId === part.id);
      if (!meta) throw new Error('Record an opening baseline and site for this historical item before receiving or issuing stock.');
      if (meta.status !== 'active') throw new Error('Archived parts cannot receive stock movements.');
      if (meta.version !== value.expectedVersion || part.stock !== value.expectedStock) throw new Error('This stock balance changed. Reopen the movement form with the latest count.');
      if (!Number.isSafeInteger(part.stock) || part.stock < 0 || part.unitCost.currency !== 'NGN' || !Number.isSafeInteger(part.unitCost.minor) || part.unitCost.minor < 0) throw new Error('This stock record needs a reviewed baseline before further movements.');
      const after = value.kind === 'adjustment' ? value.countedStock : value.kind === 'receipt' ? part.stock + value.quantity : part.stock - value.quantity;
      if (!inventoryQuantity.safeParse(after).success) throw new Error(value.kind === 'issue' ? 'Not enough stock is available for this issue.' : 'This stock movement exceeds the supported quantity limit.');
      if (value.kind === 'adjustment' && after === part.stock) throw new Error('The counted balance matches the register. No adjustment is needed.');
      assertValue((state.collections.facilityParts as Part[]).filter((row) => row.tenantId === actor.tenantId).map((row) => row.id === part.id ? { ...row, stock: after } : row));
      const before = part.stock; part.stock = after; meta.version++; meta.updatedAt = inventoryNowISO(); meta.updatedBy = actor.userId;
      const movementId = movement(data, actor, actorName, part, value.kind, before, after, value.reason, value.reference);
      return mutationResult(data, actor, value.idempotencyKey, 'stock.movement', receipt.hash, part, `stock.${value.kind}`, movementId);
    } catch (error) { return fail(error); }
  }, 'facility');
}

export async function archiveFacilityPart(input: unknown): Promise<FacilityInventoryResult> {
  return withDurableMutation(async () => {
    const parsed = archiveSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Reopen a current stock item before archiving.' };
    try {
      const value = parsed.data, { actor, scope, data } = await context(value.expectedCompanyId, 'update');
      const receipt = replay(data, actor, value.idempotencyKey, 'part.archive', { ...value, idempotencyKey: undefined }); if (receipt.prior) return receipt.prior.result;
      const part = checkedPart(actor, value.id, scope), meta = data.parts.find((row) => row.partId === part.id);
      if (!meta || meta.status !== 'active' || meta.version !== value.expectedVersion || part.stock !== value.expectedStock) throw new Error('This part changed or needs a managed opening baseline before archiving.');
      if (part.stock !== 0) throw new Error('Only zero-stock items can be archived. Record the physical issue or adjustment first.');
      meta.status = 'archived'; meta.version++; meta.updatedAt = inventoryNowISO(); meta.updatedBy = actor.userId;
      return mutationResult(data, actor, value.idempotencyKey, 'part.archive', receipt.hash, part, 'part.archived');
    } catch (error) { return fail(error); }
  }, 'facility');
}

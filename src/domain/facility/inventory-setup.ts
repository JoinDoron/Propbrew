import { z } from 'zod';
import type { Part } from '@/domain/facility';
import type { WorkspaceRecordState } from '@/server/data/record-context';

export const INVENTORY_QUANTITY_LIMIT = 1_000_000_000;
export const inventoryText = (min: number, max: number) => z.string().trim().min(min).max(max).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
export const inventoryQuantity = z.number().int().min(0).max(INVENTORY_QUANTITY_LIMIT);
export function inventoryKobo(input: string): number | null {
  if (typeof input !== 'string' || input.length > 24 || !/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(input.trim())) return null;
  const [whole, fraction = ''] = input.trim().split('.');
  const minor = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}
export function inventoryCostInput(minor: number): string { return `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, '0')}`; }
export const facilityPartFields = z.strictObject({
  siteId: inventoryText(1, 160), name: inventoryText(2, 120), category: inventoryText(2, 80), sku: inventoryText(2, 80),
  location: inventoryText(2, 160), unitOfMeasure: inventoryText(1, 40), reorderPoint: inventoryQuantity,
  usedPerMonth: inventoryQuantity, unitCostAmount: z.string().max(24).refine((value) => inventoryKobo(value) !== null),
});
export type FacilityPartMetadata = { tenantId: string; partId: string; siteId: string; unitOfMeasure: string; status: 'active' | 'archived'; version: number; createdAt: string; createdBy: string; updatedAt: string; updatedBy: string };
export type FacilityStockMovement = { id: string; tenantId: string; partId: string; siteId: string; kind: 'opening' | 'receipt' | 'issue' | 'adjustment'; delta: number; quantity: number; stockBefore: number; stockAfter: number; unitCostMinor: number; currency: 'NGN'; reason: string; reference: string; at: string; actorId: string; actorName: string };
export type FacilityInventoryResult = { ok: true; id: string; name: string; stock: number; movementId?: string } | { ok: false; error: string };
export type FacilityInventoryState = { tenantId: string; parts: FacilityPartMetadata[]; movements: FacilityStockMovement[]; receipts: { actorId: string; key: string; operation: string; hash: string; result: Extract<FacilityInventoryResult, { ok: true }> }[]; audit: { tenantId: string; actorId: string; action: string; entityId: string; at: string }[] };
const metadataSchema = z.strictObject({ tenantId: inventoryText(1, 160), partId: inventoryText(1, 160), siteId: inventoryText(1, 160), unitOfMeasure: inventoryText(1, 40), status: z.enum(['active', 'archived']), version: z.number().int().min(1), createdAt: z.iso.datetime(), createdBy: inventoryText(1, 160), updatedAt: z.iso.datetime(), updatedBy: inventoryText(1, 160) });
const movementSchema = z.strictObject({ id: z.uuid(), tenantId: inventoryText(1, 160), partId: inventoryText(1, 160), siteId: inventoryText(1, 160), kind: z.enum(['opening', 'receipt', 'issue', 'adjustment']), delta: z.number().int().min(-INVENTORY_QUANTITY_LIMIT).max(INVENTORY_QUANTITY_LIMIT), quantity: inventoryQuantity, stockBefore: inventoryQuantity, stockAfter: inventoryQuantity, unitCostMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), currency: z.literal('NGN'), reason: inventoryText(3, 500), reference: inventoryText(2, 120), at: z.iso.datetime(), actorId: inventoryText(1, 160), actorName: inventoryText(1, 160) });
const successSchema = z.strictObject({ ok: z.literal(true), id: inventoryText(1, 160), name: inventoryText(2, 120), stock: inventoryQuantity, movementId: z.uuid().optional() });
const stateSchema = z.strictObject({ tenantId: inventoryText(1, 160), parts: z.array(metadataSchema).max(10_000), movements: z.array(movementSchema), receipts: z.array(z.strictObject({ actorId: inventoryText(1, 160), key: z.uuid(), operation: inventoryText(1, 80), hash: z.string().regex(/^[0-9a-f]{64}$/), result: successSchema })), audit: z.array(z.strictObject({ tenantId: inventoryText(1, 160), actorId: inventoryText(1, 160), action: inventoryText(1, 80), entityId: inventoryText(1, 160), at: z.iso.datetime() })) });
export function facilityInventoryState(state: WorkspaceRecordState, tenantId: string, create = false): FacilityInventoryState {
  const value = state.auxiliary.facilityInventory;
  if (value === undefined) {
    const blank: FacilityInventoryState = { tenantId, parts: [], movements: [], receipts: [], audit: [] };
    if (create) state.auxiliary.facilityInventory = blank;
    return blank;
  }
  const parsed = stateSchema.parse(value);
  if (parsed.tenantId !== tenantId || parsed.parts.some((row) => row.tenantId !== tenantId) || parsed.movements.some((row) => row.tenantId !== tenantId) || parsed.audit.some((row) => row.tenantId !== tenantId)) throw new Error('Inventory records belong to another company.');
  if (parsed.movements.some((row) => row.stockAfter !== row.stockBefore + row.delta || row.quantity !== Math.abs(row.delta))) throw new Error('Inventory movement history is inconsistent.');
  return value as FacilityInventoryState;
}
export function facilityPartSnapshot(part: Part): string { return JSON.stringify([part.name, part.category, part.sku, part.location, part.stock, part.reorderPoint, part.usedPerMonth, part.unitCost.minor, part.unitCost.currency, part.siteId ?? null]); }
/** Exact integer accounting; malformed historical records require review instead of being rounded. */
export function inventoryValuation(parts: readonly Part[]): { ngnMinor: number; excluded: number; review: boolean } {
  let total = BigInt(0), excluded = 0;
  for (const row of parts) {
    if (row.unitCost.currency !== 'NGN') { excluded++; continue; }
    if (!Number.isSafeInteger(row.stock) || row.stock < 0 || !Number.isSafeInteger(row.unitCost.minor) || row.unitCost.minor < 0) return { ngnMinor: 0, excluded, review: true };
    total += BigInt(row.stock) * BigInt(row.unitCost.minor);
  }
  return total > BigInt(Number.MAX_SAFE_INTEGER) ? { ngnMinor: 0, excluded, review: true } : { ngnMinor: Number(total), excluded, review: false };
}

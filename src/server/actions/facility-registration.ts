'use server';

import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCan, type Actor } from '@/lib/authz';
import { requireWorkspace } from '@/server/workspaces';
import { withDurableMutation } from '@/server/data/durable-records';
import { currentRecordContext, getRecordAuxiliary } from '@/server/data/record-context';
import { scopedMutableGet } from '@/server/data';
import { db, nextWorkOrderRef, recordHistory } from '@/server/data/store';
import { nowISO } from '@/server/clock';
import type { Asset, WorkOrder } from '@/domain/entities';
import { asId, type AssetId, type TenantId, type UserId } from '@/domain/ids';

export type FacilityRegistrationResult = { ok: true; id: string; name: string; ref?: string } | { ok: false; error: string };
const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
const fields = z.object({ name: text(2, 120), category: text(2, 80), serial: text(1, 100), locationLabel: text(2, 160), purchaseDate: z.iso.date(), warrantyExpiry: z.iso.date(), status: z.enum(['operational', 'degraded', 'under_maintenance', 'out_of_service', 'archived']) });
const assetCreate = fields.extend({ siteId: text(1, 160), idempotencyKey: z.uuid() }).strict();
const assetUpdate = fields.extend({ id: text(1, 160) }).strict();
const workOrderCreate = z.object({ siteId: text(1, 160), assetId: text(1, 160).optional(), unitId: text(1, 160).optional(), title: text(3, 160), description: z.string().trim().max(3000).optional(), priority: z.enum(['low', 'routine', 'high', 'emergency']), idempotencyKey: z.uuid() }).strict();
function assets(): Asset[] {
  const context = currentRecordContext();
  if (!context || context.mode !== 'write') throw new Error('Asset registration requires database storage.');
  if (context.state.collections.assets === undefined) context.state.collections.assets = [];
  if (!Array.isArray(context.state.collections.assets)) throw new Error('The asset register is unavailable.');
  return context.state.collections.assets as Asset[];
}
function audit(actor: Actor, action: string, id: string) {
  getRecordAuxiliary<Record<string, unknown>[]>('facilityRegistrationAudit', () => []).push({ tenantId: actor.tenantId, actorId: actor.userId, action, entityId: id, at: nowISO() });
}
function refresh() { for (const path of ['/assets', '/facility', '/work-orders', '/estate/work-orders', '/ppm', '/portfolio']) revalidatePath(path); }
type Receipt = { key: string; actorId: string; tenantId: string; hash: string; result: FacilityRegistrationResult };
function receipt(actor: Actor, key: string, data: unknown) {
  const hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const all = getRecordAuxiliary<Receipt[]>('facilityRegistrationReceipts', () => []);
  const prior = all.find((row) => row.key === key && row.actorId === actor.userId && row.tenantId === actor.tenantId);
  return { hash, all, prior: prior ? prior.hash === hash ? prior.result : { ok: false as const, error: 'This submission key was already used for different details. Start a new form.' } : undefined };
}

export async function createFacilityAsset(input: unknown): Promise<FacilityRegistrationResult> {
  return withDurableMutation(async () => {
    const { actor } = await requireWorkspace('facility'); assertCan(actor, 'assets_ppm', 'create');
    const parsed = assetCreate.safeParse(input); if (!parsed.success) return { ok: false, error: 'Review the asset name, serial, location, dates and status.' };
    const { idempotencyKey, ...data } = parsed.data;
    if (data.warrantyExpiry < data.purchaseDate) return { ok: false, error: 'Warranty expiry cannot be before purchase.' };
    const replay = receipt(actor, idempotencyKey, data); if (replay.prior) return replay.prior;
    const site = scopedMutableGet(actor, 'assets_ppm', db.sites.map((row) => ({ ...row, siteId: row.id })), data.siteId, 'create');
    if (!site) return { ok: false, error: 'Choose an authorised estate or facility location.' };
    const rows = assets(); if (rows.some((row) => row.tenantId === actor.tenantId && row.serial.toLowerCase() === data.serial.toLowerCase())) return { ok: false, error: 'This serial is already recorded. Edit the existing asset instead.' };
    const id = `asset-${randomUUID()}`, at = nowISO();
    const created: Asset = { ...data, id: asId<AssetId>(id), tenantId: asId<TenantId>(actor.tenantId!), siteId: site.id, photos: [], archivedAt: data.status === 'archived' ? at : null, createdAt: at, updatedAt: at, createdBy: asId<UserId>(actor.userId), updatedBy: asId<UserId>(actor.userId) };
    rows.push(created);
    const result = { ok: true as const, id, name: data.name }; replay.all.push({ key: idempotencyKey, actorId: actor.userId, tenantId: actor.tenantId!, hash: replay.hash, result });
    audit(actor, 'asset.created', id); refresh(); return result;
  }, 'facility');
}

export async function updateFacilityAsset(input: unknown): Promise<FacilityRegistrationResult> {
  return withDurableMutation(async () => {
    const { actor } = await requireWorkspace('facility'); assertCan(actor, 'assets_ppm', 'update');
    const parsed = assetUpdate.safeParse(input); if (!parsed.success) return { ok: false, error: 'Review the asset name, serial, location, dates and status.' };
    const row = scopedMutableGet(actor, 'assets_ppm', assets(), parsed.data.id, 'update');
    if (!row) return { ok: false, error: 'This asset is unavailable in your assigned location.' };
    if (parsed.data.warrantyExpiry < parsed.data.purchaseDate) return { ok: false, error: 'Warranty expiry cannot be before purchase.' };
    if (row.status === 'archived' && parsed.data.status !== 'archived') return { ok: false, error: 'Archived assets cannot be reactivated by this correction form.' };
    if (assets().some((asset) => asset.tenantId === actor.tenantId && asset.id !== row.id && asset.serial.toLowerCase() === parsed.data.serial.toLowerCase())) return { ok: false, error: 'This serial belongs to another recorded asset.' };
    const details = fields.parse(parsed.data);
    Object.assign(row, details, { archivedAt: details.status === 'archived' ? row.archivedAt ?? nowISO() : null, updatedAt: nowISO(), updatedBy: actor.userId });
    for (const plan of db.ppmPlans) if (plan.tenantId === actor.tenantId && plan.assetId === row.id) plan.assetName = row.name;
    audit(actor, 'asset.updated', String(row.id)); refresh(); return { ok: true, id: String(row.id), name: row.name };
  }, 'facility');
}

export async function createFacilityWorkOrder(input: unknown): Promise<FacilityRegistrationResult> {
  return withDurableMutation(async () => {
    const session = await requireWorkspace('facility'), actor = session.actor; assertCan(actor, 'work_orders', 'create');
    const parsed = workOrderCreate.safeParse(input); if (!parsed.success) return { ok: false, error: 'Choose an authorised location, title, priority and valid submission key.' };
    const { idempotencyKey, ...data } = parsed.data; const replay = receipt(actor, idempotencyKey, data); if (replay.prior) return replay.prior;
    const site = scopedMutableGet(actor, 'work_orders', db.sites.map((row) => ({ ...row, siteId: row.id })), data.siteId, 'create');
    if (!site) return { ok: false, error: 'Choose an authorised location.' };
    const unit = data.unitId ? scopedMutableGet(actor, 'work_orders', db.units.map((row) => ({ ...row, unitId: row.id })), data.unitId, 'create') : null;
    if (data.unitId && (!unit || unit.siteId !== site.id)) return { ok: false, error: 'The unit must belong to the selected location.' };
    const asset = data.assetId ? scopedMutableGet(actor, 'work_orders', assets(), data.assetId, 'create') : null;
    if (data.assetId && (!asset || asset.siteId !== site.id || asset.status === 'archived')) return { ok: false, error: 'Choose an active asset in the selected location.' };
    const id = `wo-facility-${randomUUID()}`, ref = nextWorkOrderRef(), at = nowISO();
    const name = db.users.find((user) => user.tenantId === actor.tenantId && user.id === actor.userId)?.name ?? session.label;
    db.workOrders.push({ tenantId: actor.tenantId!, id, ref, title: data.title, description: data.description || undefined, siteId: site.id, estateId: site.id, unitId: unit?.id, assetId: asset?.id, status: 'new', priority: data.priority, origin: 'manager', requesterUserId: actor.userId, requesterName: name, assigneeName: 'Unassigned', respondDueAt: null, resolveDueAt: null, cost: null, createdAt: at, updatedAt: at, createdBy: actor.userId, updatedBy: actor.userId } as WorkOrder);
    recordHistory('work-order', id, { at, event: 'CREATE', from: null, to: 'new', actorId: actor.userId, actorName: name, actorRole: 'facility_manager', note: 'Created in the Facility workspace.' });
    const result = { ok: true as const, id, ref, name: data.title }; replay.all.push({ key: idempotencyKey, actorId: actor.userId, tenantId: actor.tenantId!, hash: replay.hash, result });
    refresh(); return result;
  }, 'facility');
}

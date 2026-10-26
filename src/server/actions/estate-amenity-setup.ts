'use server';

import { createHash, randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { assertCan, matchesScope, type Actor } from '@/lib/authz';
import { requireWorkspace } from '@/server/workspaces';
import { withDurableMutation } from '@/server/data/durable-records';
import { db, recordHistory } from '@/server/data/store';
import { amenityRegistry, estateAmenitiesFor } from '@/server/estate/amenities';
import { amenityDetailsSchema, amenityMinor, amenityApproval, amenityBookingEnd, amenitySlotAvailable, matchingAmenityBookings } from '@/domain/estate/amenities';
import { operatingNowISO, operatingNowMs } from '@/server/operating-clock';
import { money } from '@/domain/primitives';
import type { Booking } from '@/domain/entities';

export type AmenitySetupResult = { ok: true; id: string; name: string; status?: string } | { ok: false; error: string };
const key = z.string().trim().min(1).max(160);
const binding = { expectedCompanyId: key, idempotencyKey: z.uuid() };
const createSchema = amenityDetailsSchema.safeExtend({ siteId: key, ...binding });
const updateSchema = amenityDetailsSchema.safeExtend({ id: z.uuid(), revision: z.number().int().min(1), ...binding });
const archiveSchema = z.strictObject({ id: z.uuid(), revision: z.number().int().min(1), ...binding });
const bookingSchema = z.strictObject({ amenityId: key, residentId: key, expectedUnitId: key, slotISO: z.iso.datetime(), ...binding });
const refresh = () => ['/bookings', '/portal/bookings', '/estate'].forEach((path) => revalidatePath(path));
async function actorFor(expectedCompanyId: string, action: 'create' | 'update') {
  const { actor } = await requireWorkspace('estate');
  assertCan(actor, 'bookings_amenities', action);
  if (!actor.tenantId || expectedCompanyId !== actor.tenantId) throw new Error('Your company changed. Reopen this form in the company you want to update.');
  return actor;
}
function replay(actor: Actor, idempotencyKey: string, kind: string, data: unknown) {
  const registry = amenityRegistry(true), hash = createHash('sha256').update(JSON.stringify(data)).digest('hex');
  const prior = registry.receipts.find((row) => row.tenantId === actor.tenantId && row.actorId === actor.userId && row.key === idempotencyKey);
  if (prior) return { registry, hash, result: prior.hash === hash && prior.kind === kind
    ? { ok: true as const, id: prior.id, name: prior.name ?? (kind === 'booking' ? db.bookings.find((row) => row.tenantId === actor.tenantId && row.id === prior.id)?.amenity ?? 'Booking' : registry.amenities.find((row) => row.id === prior.id)?.name ?? 'Amenity') }
    : { ok: false as const, error: 'This submission key was already used for other details. Open a new form.' } };
  return { registry, hash, result: undefined };
}
function finish(actor: Actor, replayed: ReturnType<typeof replay>, keyValue: string, kind: string, row: { id: string; name: string }, action: string): AmenitySetupResult {
  replayed.registry.receipts.push({ tenantId: actor.tenantId!, actorId: actor.userId, key: keyValue, hash: replayed.hash, id: row.id, name: row.name, kind });
  replayed.registry.audit.push({ tenantId: actor.tenantId!, actorId: actor.userId, action, entityId: row.id, at: operatingNowISO() });
  refresh(); return { ok: true, id: row.id, name: row.name };
}
function scopedAmenity(actor: Actor, id: string) {
  const scope = assertCan(actor, 'bookings_amenities', 'update');
  return amenityRegistry(true).amenities.find((row) => row.id === id && matchesScope(row, scope));
}

export async function createEstateAmenity(input: unknown): Promise<AmenitySetupResult> {
  return withDurableMutation(async () => {
    const parsed = createSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Review the amenity name, location, capacity, fee and WAT opening hours.' };
    const { expectedCompanyId, idempotencyKey, ...data } = parsed.data;
    const actor = await actorFor(expectedCompanyId, 'create'), prior = replay(actor, idempotencyKey, 'create', data); if (prior.result) return prior.result;
    const scope = assertCan(actor, 'bookings_amenities', 'create');
    const site = db.sites.find((row) => row.id === data.siteId && row.kind === 'estate' && matchesScope({ ...row, siteId: row.id }, scope));
    if (!site) return { ok: false, error: 'Choose an estate property available to your account.' };
    if (prior.registry.amenities.some((row) => row.tenantId === actor.tenantId && row.siteId === site.id && row.name.toLocaleLowerCase('en') === data.name.toLocaleLowerCase('en'))) return { ok: false, error: 'An amenity with this name already exists at this property.' };
    const at = operatingNowISO(), id = randomUUID();
    const { feeMajor, ...details } = data;
    prior.registry.amenities.push({ ...details, id, tenantId: actor.tenantId!, siteId: String(site.id), feeMinor: amenityMinor(feeMajor), status: 'active', revision: 1, createdAt: at, updatedAt: at });
    return finish(actor, prior, idempotencyKey, 'create', { id, name: data.name }, 'amenity.created');
  }, 'estate');
}

export async function updateEstateAmenity(input: unknown): Promise<AmenitySetupResult> {
  return withDurableMutation(async () => {
    const parsed = updateSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Review the amenity details and reopen a current form.' };
    const { expectedCompanyId, idempotencyKey, id, revision, ...data } = parsed.data;
    const actor = await actorFor(expectedCompanyId, 'update'), prior = replay(actor, idempotencyKey, 'update', { id, revision, ...data }); if (prior.result) return prior.result;
    const row = scopedAmenity(actor, id); if (!row || row.status !== 'active') return { ok: false, error: 'Choose an active amenity in your estate scope.' };
    if (row.revision !== revision) return { ok: false, error: 'This amenity changed in another tab. Reopen the latest details.' };
    if (prior.registry.amenities.some((other) => other.tenantId === actor.tenantId && other.siteId === row.siteId && other.id !== id && other.name.toLocaleLowerCase('en') === data.name.toLocaleLowerCase('en'))) return { ok: false, error: 'This name belongs to another amenity at the property.' };
    const future = matchingAmenityBookings(row, db.bookings).some((booking) => Date.parse(booking.endISO ?? booking.slot) > operatingNowMs());
    if (future && (row.capacity !== data.capacity || row.openMinute !== data.openMinute || row.closeMinute !== data.closeMinute || row.durationMinutes !== data.durationMinutes)) return { ok: false, error: 'Cancel or complete future reservations before changing capacity, hours or slot duration. Existing reservations keep their recorded terms.' };
    const { feeMajor, ...details } = data;
    Object.assign(row, details, { feeMinor: amenityMinor(feeMajor), revision: revision + 1, updatedAt: operatingNowISO() });
    return finish(actor, prior, idempotencyKey, 'update', row, 'amenity.updated');
  }, 'estate');
}

export async function archiveEstateAmenity(input: unknown): Promise<AmenitySetupResult> {
  return withDurableMutation(async () => {
    const parsed = archiveSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Reopen a current amenity record before archiving.' };
    const { expectedCompanyId, idempotencyKey, id, revision } = parsed.data;
    const actor = await actorFor(expectedCompanyId, 'update'), prior = replay(actor, idempotencyKey, 'archive', { id, revision }); if (prior.result) return prior.result;
    const row = scopedAmenity(actor, id); if (!row || row.status !== 'active' || row.revision !== revision) return { ok: false, error: 'The amenity is unavailable or changed. Refresh before archiving.' };
    if (matchingAmenityBookings(row, db.bookings).some((booking) => Date.parse(booking.endISO ?? booking.slot) > operatingNowMs())) return { ok: false, error: 'Cancel or complete future reservations before archiving this amenity.' };
    row.status = 'archived'; row.revision += 1; row.updatedAt = operatingNowISO();
    return finish(actor, prior, idempotencyKey, 'archive', row, 'amenity.archived');
  }, 'estate');
}

export async function createEstateAmenityBooking(input: unknown): Promise<AmenitySetupResult> {
  return withDurableMutation(async () => {
    const parsed = bookingSchema.safeParse(input); if (!parsed.success) return { ok: false, error: 'Choose an amenity, resident, future time and valid submission key.' };
    const { expectedCompanyId, idempotencyKey, ...data } = parsed.data;
    const actor = await actorFor(expectedCompanyId, 'create'), prior = replay(actor, idempotencyKey, 'booking', data); if (prior.result) return prior.result;
    const amenity = estateAmenitiesFor(actor).find((row) => row.id === data.amenityId && row.status === 'active');
    if (!amenity) return { ok: false, error: 'Choose a configured active amenity in your estate scope.' };
    const scope = assertCan(actor, 'bookings_amenities', 'create');
    const resident = db.residents.find((row) => row.id === data.residentId && matchesScope({ ...row, ownerUserId: row.userId }, scope) && row.siteId === amenity.siteId && ['active', 'invited'].includes(row.status));
    const unit = resident && db.units.find((row) => row.tenantId === actor.tenantId && row.id === resident.unitId && row.siteId === amenity.siteId);
    if (!resident || !unit || resident.unitId !== data.expectedUnitId) return { ok: false, error: 'Choose a resident linked to a unit at this amenity’s property.' };
    let endISO: string; try { endISO = amenityBookingEnd(amenity, data.slotISO, operatingNowMs()); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Choose a valid future slot.' }; }
    if (!amenitySlotAvailable(amenity, data.slotISO, endISO, db.bookings)) return { ok: false, error: 'This slot has reached its configured capacity. Choose another time.' };
    const id = `bk-manager-${randomUUID()}`, rule = amenityApproval(amenity, data.slotISO), status = rule.auto ? amenity.feeMinor === 0 ? 'confirmed' : 'auto_approved' : 'requested';
    db.bookings.push({ tenantId: actor.tenantId!, id, amenityId: amenity.id, amenity: amenity.name, estateId: amenity.siteId, unitId: unit.id, ownerUserId: resident.userId, residentName: resident.name, status, slot: data.slotISO, endISO, fee: money(amenity.feeMinor, 'NGN') } as Booking);
    recordHistory('booking', id, { at: operatingNowISO(), event: 'REQUEST', from: null, to: 'requested', actorId: actor.userId, actorName: 'Estate manager', actorRole: 'estate_manager', note: 'Recorded on behalf of a resident. No payment collected.' });
    if (rule.auto) recordHistory('booking', id, { at: operatingNowISO(), event: 'AUTO_APPROVE', from: 'requested', to: 'auto_approved', actorId: actor.userId, actorName: 'Configured amenity rule', actorRole: 'system_rule', note: rule.reason });
    if (status === 'confirmed') recordHistory('booking', id, { at: operatingNowISO(), event: 'CONFIRM', from: 'auto_approved', to: 'confirmed', actorId: actor.userId, actorName: 'Configured amenity rule', actorRole: 'system_rule', note: 'Fee-free reservation confirmed. No payment collected.' });
    return finish(actor, prior, idempotencyKey, 'booking', { id, name: amenity.name }, 'booking.created');
  }, 'estate');
}

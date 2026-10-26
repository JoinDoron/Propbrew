'use server';

import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { estateAmenitiesFor, amenityRegistry } from '@/server/estate/amenities';
import { amenityApproval, amenityBookingEnd, amenitySlotAvailable } from '@/domain/estate/amenities';
import { getActiveUnitId } from '@/server/active-unit';
import { operatingNowMs } from '@/server/operating-clock';
import { withDurableMutation } from '@/server/data/durable-records';

import { nextRecordSequence } from '@/server/data/record-context';

/**
 * Resident amenity booking (EM-05, §7 O). A resident may CREATE a booking for
 * their own account; the auto-approval RULE decides whether it lands approved
 * or waits for a manager (advisory rules from the bookings engine). Manual-rule
 * amenities always come in as `requested`. Lands in the shared store + audit.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan } from '@/lib/authz';
import { repos } from '@/server/data';
import { db, recordHistory } from '@/server/data/store';
import { money } from '@/domain/primitives';
import { AMENITIES, wouldAutoApprove } from '@/domain/bookings';
import type { Booking } from '@/domain/entities';
import { nowISO } from '@/server/clock';

export type BookResult = { ok: true; status: string; auto: boolean } | { ok: false; error: string };


export async function createBooking(amenity: string, slotISO: string, binding?: { expectedCompanyId: string; expectedUnitId: string; idempotencyKey: string }): Promise<BookResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  try {
    assertCan(actor, 'bookings_amenities', 'create'); // resident (§7 O)
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot make a booking.' };
    throw e;
  }
  if (nativeAuthEnabled()) {
    const scopedBinding = z.strictObject({ expectedCompanyId: z.string().min(1).max(160), expectedUnitId: z.string().min(1).max(160), idempotencyKey: z.uuid() }).safeParse(binding);
    if (!scopedBinding.success || scopedBinding.data.expectedCompanyId !== actor.tenantId) return { ok: false, error: 'Your company changed. Reopen this booking form.' };
    const activeUnitId = await getActiveUnitId(actor.unitIds);
    if (!activeUnitId || scopedBinding.data.expectedUnitId !== activeUnitId) return { ok: false, error: 'Your active unit changed. Reopen this booking form.' };
    const selected = estateAmenitiesFor(actor).find((row) => row.id === amenity && row.status === 'active');
    const me = db.residents.find((row) => row.tenantId === actor.tenantId && row.userId === actor.userId && row.unitId === activeUnitId && row.siteId === selected?.siteId && row.status === 'active');
    const unit = me && db.units.find((row) => row.tenantId === actor.tenantId && row.id === me.unitId && row.siteId === selected?.siteId);
    if (!selected || !me || !unit) return { ok: false, error: 'Choose an active amenity on your assigned unit’s property.' };
    if (!z.iso.datetime().safeParse(slotISO).success) return { ok: false, error: 'Choose a valid booking time.' };
    const registry = amenityRegistry(true), hash = createHash('sha256').update(JSON.stringify({ amenity, slotISO, residentId: me.id })).digest('hex');
    const prior = registry.receipts.find((row) => row.tenantId === actor.tenantId && row.actorId === actor.userId && row.key === scopedBinding.data.idempotencyKey);
    if (prior) {
      const booking = db.bookings.find((row) => row.tenantId === actor.tenantId && row.id === prior.id);
      return prior.kind === 'resident-booking' && prior.hash === hash && booking ? { ok: true, status: booking.status, auto: booking.status !== 'requested' } : { ok: false, error: 'This booking key was already used for different details.' };
    }
    let endISO: string; try { endISO = amenityBookingEnd(selected, slotISO, operatingNowMs()); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : 'Choose a valid future slot.' }; }
    if (!amenitySlotAvailable(selected, slotISO, endISO, db.bookings)) return { ok: false, error: 'The selected slot has reached capacity. Choose another time.' };
    const rule = amenityApproval(selected, slotISO), status = rule.auto ? selected.feeMinor === 0 ? 'confirmed' : 'auto_approved' : 'requested';
    const id = `bk-res-${randomUUID()}`;
    db.bookings.push({ tenantId: actor.tenantId!, id, amenityId: selected.id, amenity: selected.name, estateId: selected.siteId, unitId: unit.id, ownerUserId: actor.userId, residentName: me.name, status, slot: slotISO, endISO, fee: money(selected.feeMinor, 'NGN') } as Booking);
    recordHistory('booking', id, { at: nowISO(), event: 'REQUEST', from: null, to: 'requested', actorId: actor.userId, actorName: me.name, actorRole: 'resident' });
    if (rule.auto) recordHistory('booking', id, { at: nowISO(), event: 'AUTO_APPROVE', from: 'requested', to: 'auto_approved', actorId: actor.userId, actorName: 'Configured amenity rule', actorRole: 'system_rule', note: rule.reason });
    if (status === 'confirmed') recordHistory('booking', id, { at: nowISO(), event: 'CONFIRM', from: 'auto_approved', to: 'confirmed', actorId: actor.userId, actorName: 'Configured amenity rule', actorRole: 'system_rule', note: 'Fee-free reservation. No payment collected.' });
    registry.receipts.push({ tenantId: actor.tenantId!, actorId: actor.userId, key: scopedBinding.data.idempotencyKey, hash, id, name: selected.name, kind: 'resident-booking' });
    registry.audit.push({ tenantId: actor.tenantId!, actorId: actor.userId, entityId: id, action: 'booking.created', at: nowISO() });
    ['/portal/bookings', '/portal', '/bookings', '/estate'].forEach((path) => revalidatePath(path));
    return { ok: true, status, auto: rule.auto };
  }
  const a = AMENITIES.find((row) => row.name === amenity);
  if (!a) return { ok: false, error: 'Unknown amenity.' };
  if (Number.isNaN(Date.parse(slotISO))) return { ok: false, error: 'Pick a valid time slot.' };

  const rule = wouldAutoApprove(amenity, slotISO);
  const status = rule.auto ? 'auto_approved' : 'requested';
  const me = repos.residents.list(actor).items.find((r) => r.userId === actor.userId && actor.unitIds.includes(r.unitId));
  if (!me || !db.units.some((unit) => unit.tenantId === actor.tenantId && unit.id === me.unitId && unit.siteId === me.siteId)) return { ok: false, error: 'Your resident account needs a linked unit before booking.' };
  const estateId = me.siteId;

  const booking = {
    tenantId: actor.tenantId,
    id: `bk-res-${nextRecordSequence('resident-bookings:counter', 0, true)}`,
    amenity,
    estateId,
    ownerUserId: actor.userId,
    unitId: me.unitId,
    residentName: me.name,
    status,
    slot: slotISO,
    fee: a.feeMinor > 0 ? money(a.feeMinor, 'NGN') : null,
  } as unknown as Booking;

  db.bookings.unshift(booking);
  recordHistory('booking', booking.id, {
    at: nowISO(), event: rule.auto ? 'AUTO_APPROVE' : 'REQUEST', from: null, to: status,
    actorId: actor.userId, actorName: me?.name ?? 'Resident', actorRole: 'resident',
    note: rule.reason,
  });

  ['/portal/bookings', '/portal', '/bookings', '/estate'].forEach((p) => revalidatePath(p));
  return { ok: true, status, auto: rule.auto };

  }, 'estate');
}

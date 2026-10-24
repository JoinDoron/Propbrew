'use server';

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
import { amenityOf, wouldAutoApprove } from '@/domain/bookings';
import type { Booking } from '@/domain/entities';
import { nowISO } from '@/server/clock';

export type BookResult = { ok: true; status: string; auto: boolean } | { ok: false; error: string };


export async function createBooking(amenity: string, slotISO: string): Promise<BookResult> {
  return withDurableMutation(async () => {
  const actor = await getActor();
  try {
    assertCan(actor, 'bookings_amenities', 'create'); // resident (§7 O)
  } catch (e) {
    if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot make a booking.' };
    throw e;
  }
  const a = amenityOf(amenity);
  if (!a) return { ok: false, error: 'Unknown amenity.' };
  if (Number.isNaN(Date.parse(slotISO))) return { ok: false, error: 'Pick a valid time slot.' };

  const rule = wouldAutoApprove(amenity, slotISO);
  const status = rule.auto ? 'auto_approved' : 'requested';
  const me = repos.residents.list(actor).items.find((r) => r.userId === actor.userId);
  const estateId = actor.estateIds[0] ?? 's-gardens';

  const booking = {
    tenantId: actor.tenantId,
    id: `bk-res-${nextRecordSequence('resident-bookings:counter', 0, true)}`,
    amenity,
    estateId,
    ownerUserId: actor.userId,
    residentName: me?.name ?? 'Resident',
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

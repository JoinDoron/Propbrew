'use server';

/**
 * Short-Let PMS server actions (new module, gated by the §7 bookings capability).
 * Bookings are driven through the shortlet-booking §10 machine; payments and
 * caution decisions are recorded off-platform (Assumption 2). Every mutation
 * re-checks the capability and records SC-10 history.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, type Role } from '@/lib/authz';
import { repos } from '@/server/data';
import { db, recordHistory } from '@/server/data/store';
import { money } from '@/domain/primitives';
import { NOW } from '@/domain/ppm';
import { nightsBetween } from '@/domain/shortlet';
import { shortletBookingMachine } from '@/domain/workflows';
import type { SlBooking, SlInspection, InspectionItem, ExpenseCategory, BookingSource } from '@/domain/shortlet/types';

const PATHS = ['/shortlet', '/shortlet/bookings', '/shortlet/calendar', '/shortlet/inspections', '/shortlet/expenses', '/shortlet/analytics', '/shortlet/guests'];
const revalidate = () => PATHS.forEach((p) => revalidatePath(p));

export type Res = { ok: true; ref?: string } | { ok: false; error: string };

async function gate(action: 'create' | 'update' | 'transition'): Promise<{ actor: Awaited<ReturnType<typeof getActor>> } | { ok: false; error: string }> {
  const actor = await getActor();
  try { assertCan(actor, 'bookings_amenities', action); return { actor }; }
  catch (e) { if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot manage short-let bookings.' }; throw e; }
}

let seq = 5200;

/* --- create a booking (FR-BM-01) ------------------------------------------ */
export async function createBooking(input: { apartmentId: string; guestName: string; guestPhone: string; checkIn: string; checkOut: string; source: BookingSource; cautionNaira: number }): Promise<Res> {
  const g = await gate('create'); if ('ok' in g) return g;
  const apt = repos.shortletApartments.list(g.actor).items.find((a) => a.id === input.apartmentId);
  if (!apt) return { ok: false, error: 'Apartment not found.' };
  if (!input.guestName.trim()) return { ok: false, error: 'Guest name is required.' };
  if (Date.parse(input.checkOut) <= Date.parse(input.checkIn)) return { ok: false, error: 'Check-out must be after check-in.' };

  const nights = nightsBetween(input.checkIn, input.checkOut);
  const totalMinor = nights * apt.nightlyRate.minor;
  const ref = `SL-${seq++}`;
  const booking = {
    tenantId: g.actor.tenantId, id: `slb-new-${ref}`, ref, apartmentId: apt.id, propertyId: apt.propertyId,
    guestName: input.guestName.trim(), guestPhone: input.guestPhone.trim(),
    checkIn: input.checkIn, checkOut: input.checkOut, nights, source: input.source,
    nightlyRate: apt.nightlyRate, total: money(totalMinor, 'NGN'), paid: money(0, 'NGN'),
    cautionFee: money(Math.round(input.cautionNaira * 100), 'NGN'), cautionStatus: 'held', cautionDeducted: money(0, 'NGN'),
    status: 'enquiry', guestToken: `g-${ref}`, createdAt: NOW,
  } as unknown as SlBooking;

  db.shortletBookings.unshift(booking);
  recordHistory('shortlet-booking', booking.id, { at: NOW, event: 'CREATE', from: null, to: 'enquiry', actorId: g.actor.userId, actorName: 'Operator', actorRole: (g.actor.roles[0] as Role) ?? 'estate_manager', note: `${apt.name} · ${nights} nights` });
  revalidate();
  return { ok: true, ref };
}

/* --- advance a booking through the machine (FR-BM / FR-CI) ----------------- */
export async function advanceBooking(id: string, event: string): Promise<Res> {
  const g = await gate('transition'); if ('ok' in g) return g;
  const live = db.shortletBookings.find((b) => b.id === id);
  if (!live) return { ok: false, error: 'Booking not found.' };
  const roles = g.actor.roles as Role[];
  const t = shortletBookingMachine.transitions.find((x) => x.from === live.status && x.event === event && x.actors.some((a) => roles.includes(a as Role)));
  if (!t) return { ok: false, error: `Cannot ${event.toLowerCase()} from ${live.status}.` };

  const from = live.status;
  live.status = t.to;
  if (t.to === 'cancelled' && live.cautionStatus === 'held') live.cautionStatus = 'refunded';
  recordHistory('shortlet-booking', live.id, { at: NOW, event, from, to: t.to, actorId: g.actor.userId, actorName: 'Operator', actorRole: roles[0] ?? 'estate_manager' });
  revalidate();
  return { ok: true, ref: live.ref };
}

/* --- record an off-platform payment (FR-BM-02) ---------------------------- */
export async function recordPayment(id: string, amountNaira: number): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const live = db.shortletBookings.find((b) => b.id === id);
  if (!live) return { ok: false, error: 'Booking not found.' };
  if (!(amountNaira > 0)) return { ok: false, error: 'Enter an amount greater than zero.' };
  const add = Math.round(amountNaira * 100);
  live.paid = money(Math.min(live.total.minor, live.paid.minor + add), 'NGN');
  recordHistory('shortlet-booking', live.id, { at: NOW, event: 'PAYMENT_RECORDED', from: live.status, to: live.status, actorId: g.actor.userId, actorName: 'Operator', actorRole: (g.actor.roles[0] as Role) ?? 'estate_manager', note: `₦${amountNaira.toLocaleString()} recorded` });
  revalidate();
  return { ok: true };
}

/* --- checkout inspection → caution decision (FR-CI) ----------------------- */
export async function saveInspection(bookingId: string, items: InspectionItem[], inspectorName: string): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const live = db.shortletBookings.find((b) => b.id === bookingId);
  if (!live) return { ok: false, error: 'Booking not found.' };

  const damageTotal = items.reduce((n, it) => n + (it.condition !== 'ok' ? it.chargeMinor ?? 0 : 0), 0);
  const outcome: SlInspection['outcome'] = damageTotal > 0 ? 'deductions' : 'clear';
  const insp = { tenantId: g.actor.tenantId, id: `si-${bookingId}`, bookingId, apartmentId: live.apartmentId, inspectorName: inspectorName || 'Operator', at: NOW, items, outcome, damageTotal: money(damageTotal, 'NGN') } as unknown as SlInspection;
  const existing = db.shortletInspections.findIndex((i) => i.bookingId === bookingId);
  if (existing >= 0) db.shortletInspections[existing] = insp; else db.shortletInspections.unshift(insp);

  // Drive the caution decision + close the booking (FR-CI-03).
  live.cautionDeducted = money(Math.min(damageTotal, live.cautionFee.minor), 'NGN');
  live.cautionStatus = damageTotal <= 0 ? 'refunded' : damageTotal >= live.cautionFee.minor ? 'forfeited' : 'partly_deducted';
  const from = live.status;
  if (live.status === 'checked_out') live.status = 'closed';
  recordHistory('shortlet-booking', live.id, { at: NOW, event: 'CLOSE', from, to: live.status, actorId: g.actor.userId, actorName: 'Operator', actorRole: (g.actor.roles[0] as Role) ?? 'estate_manager', note: outcome === 'clear' ? 'Caution refunded in full' : `₦${(damageTotal / 100).toLocaleString()} deducted` });
  revalidate();
  return { ok: true };
}

/* --- log an expense (FR-EX-01) -------------------------------------------- */
export async function logExpense(input: { propertyId: string; category: ExpenseCategory; amountNaira: number; date: string; note: string }): Promise<Res> {
  const g = await gate('create'); if ('ok' in g) return g;
  if (!(input.amountNaira > 0)) return { ok: false, error: 'Enter an amount greater than zero.' };
  db.shortletExpenses.unshift({ tenantId: g.actor.tenantId, id: `se-new-${Date.parse(input.date)}-${Math.round(input.amountNaira)}`, propertyId: input.propertyId, category: input.category, amount: money(Math.round(input.amountNaira * 100), 'NGN'), date: input.date, note: input.note.trim() || input.category } as never);
  revalidate();
  return { ok: true };
}

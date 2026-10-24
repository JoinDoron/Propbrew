'use server';

import { withDurableMutation } from '@/server/data/durable-records';

import { nextRecordSequence } from '@/server/data/record-context';

/**
 * Short-Let PMS server actions (new module, gated by the §7 bookings capability).
 * Bookings are driven through the shortlet-booking §10 machine; payments and
 * caution decisions are recorded off-platform (Assumption 2). Every mutation
 * re-checks the capability and records SC-10 history.
 */

import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, type Role } from '@/lib/authz';
import { repos, scopedMutableGet } from '@/server/data';
import { db, recordHistory } from '@/server/data/store';
import { money } from '@/domain/primitives';
import { NOW } from '@/domain/ppm';
import { nightsBetween, planFor } from '@/domain/shortlet';
import { shortletSettings } from '@/server/shortlet-settings';
import { shortletBookingMachine } from '@/domain/workflows';
import type { SlBooking, SlInspection, InspectionItem, ExpenseCategory, BookingSource, Channel } from '@/domain/shortlet/types';
import type { PlanKey, TeamRole, TeamMember } from '@/domain/shortlet/plan';
import { suggestPriority, ISSUE_NEXT, type RuleType, type IssuePriority, type PricingRule, type MaintenanceIssue, type Agent } from '@/domain/shortlet/operations';
import { nowISO } from '@/server/clock';
import { canEnterWorkspace } from '@/config/workspaces';

const PATHS = ['/shortlet', '/shortlet/bookings', '/shortlet/calendar', '/shortlet/inspections', '/shortlet/expenses', '/shortlet/analytics', '/shortlet/guests', '/shortlet/whatsapp', '/shortlet/channels', '/shortlet/plan', '/shortlet/team', '/shortlet/pricing', '/shortlet/maintenance', '/shortlet/agents', '/shortlet/reviews', '/shortlet/booking-page', '/shortlet/properties', '/shortlet/copilot'];
const revalidate = () => PATHS.forEach((p) => revalidatePath(p));

export type Res = { ok: true; ref?: string } | { ok: false; error: string };

async function gate(action: 'create' | 'update' | 'transition'): Promise<{ actor: Awaited<ReturnType<typeof getActor>> } | { ok: false; error: string }> {
  const actor = await getActor();
  if (!canEnterWorkspace(actor, 'shortlet')) return { ok: false, error: 'You cannot enter the shortlet workspace with this account.' };
  try { assertCan(actor, 'bookings_amenities', action); return { actor }; }
  catch (e) { if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot manage short-let bookings.' }; throw e; }
}

const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const minorAmount = (value: number) => Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value * 100)) ? Math.round(value * 100) : null;
const sources: readonly string[] = ['direct', 'airbnb', 'booking_com', 'whatsapp', 'agent'];
const teamRoles: readonly string[] = ['manager', 'housekeeper', 'accountant'];
function overlaps(actor: Awaited<ReturnType<typeof getActor>>, apartmentId: string, checkIn: string, checkOut: string, exceptId?: string): boolean {
  return repos.shortletBookings.list(actor, { limit: Number.MAX_SAFE_INTEGER }).items.some((booking) => booking.id !== exceptId && booking.apartmentId === apartmentId && booking.status !== 'cancelled' && Date.parse(booking.checkIn) < Date.parse(checkOut) && Date.parse(booking.checkOut) > Date.parse(checkIn));
}

/* --- create a booking (FR-BM-01) ------------------------------------------ */
export async function createBooking(input: { apartmentId: string; guestName: string; guestPhone: string; guestEmail?: string; checkIn: string; checkOut: string; source: BookingSource; agentName?: string; status?: string; cautionNaira: number; paidNaira?: number; specialRequests?: string }): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('create'); if ('ok' in g) return g;
  const apt = scopedMutableGet(g.actor, 'bookings_amenities', db.shortletApartments, input.apartmentId, 'create');
  if (!apt) return { ok: false, error: 'Apartment not found.' };
  if (apt.status !== 'active') return { ok: false, error: 'Choose an active apartment.' };
  if (!input.guestName.trim()) return { ok: false, error: 'Guest name is required.' };
  if (!validDate(input.checkIn) || !validDate(input.checkOut)) return { ok: false, error: 'Enter valid check-in and check-out dates.' };
  if (Date.parse(input.checkOut) <= Date.parse(input.checkIn)) return { ok: false, error: 'Check-out must be after check-in.' };
  if (!sources.includes(input.source) || input.status && !['confirmed', 'enquiry'].includes(input.status)) return { ok: false, error: 'Choose a valid booking source and status.' };
  if (overlaps(g.actor, apt.id, input.checkIn, input.checkOut)) return { ok: false, error: 'This apartment has an overlapping recorded stay. Review the calendar first.' };
  const cautionMinor = minorAmount(input.cautionNaira), paidMinor = minorAmount(input.paidNaira ?? 0);
  if (cautionMinor === null || paidMinor === null) return { ok: false, error: 'Enter finite, non-negative NGN payment and caution amounts.' };
  if (apt.nightlyRate.currency !== 'NGN') return { ok: false, error: 'This payment form records NGN only. Review the apartment currency first.' };

  const nights = nightsBetween(input.checkIn, input.checkOut);
  const totalMinor = nights * apt.nightlyRate.minor;
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0 || paidMinor > totalMinor) return { ok: false, error: 'The payment cannot exceed the valid booking total.' };
  const ref = `SL-${nextRecordSequence('shortlet:seq', 5200)}`;
  const status = input.status === 'confirmed' ? 'confirmed' : 'enquiry';
  const booking = {
    tenantId: g.actor.tenantId, id: `slb-new-${ref}`, ref, apartmentId: apt.id, propertyId: apt.propertyId,
    guestName: input.guestName.trim(), guestPhone: input.guestPhone.trim(), guestEmail: input.guestEmail?.trim() || undefined,
    checkIn: input.checkIn, checkOut: input.checkOut, nights, source: input.source, agentName: input.agentName?.trim() || undefined,
    nightlyRate: apt.nightlyRate, total: money(totalMinor, 'NGN'), paid: money(paidMinor, 'NGN'),
    cautionFee: money(cautionMinor, 'NGN'), cautionStatus: 'held', cautionDeducted: money(0, 'NGN'),
    status, guestToken: randomUUID(), specialRequests: input.specialRequests?.trim() || undefined, createdAt: NOW,
  } as unknown as SlBooking;

  db.shortletBookings.unshift(booking);
  recordHistory('shortlet-booking', booking.id, { at: nowISO(), event: 'CREATE', from: null, to: status, actorId: g.actor.userId, actorName: 'Operator', actorRole: (g.actor.roles[0] as Role) ?? 'estate_manager', note: `${apt.name} · ${nights} nights` });
  revalidate();
  return { ok: true, ref };

  });
}

/* --- advance a booking through the machine (FR-BM / FR-CI) ----------------- */
export async function advanceBooking(id: string, event: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('transition'); if ('ok' in g) return g;
  const live = scopedMutableGet(g.actor, 'bookings_amenities', db.shortletBookings, id, 'transition');
  if (!live) return { ok: false, error: 'Booking not found.' };
  const roles = g.actor.roles as Role[];
  const t = shortletBookingMachine.transitions.find((x) => x.from === live.status && x.event === event && x.actors.some((a) => roles.includes(a as Role)));
  if (!t) return { ok: false, error: `Cannot ${event.toLowerCase()} from ${live.status}.` };
  if (event === 'CONFIRM' && overlaps(g.actor, live.apartmentId, live.checkIn, live.checkOut, live.id)) return { ok: false, error: 'This apartment has an overlapping recorded stay. Review the calendar first.' };
  const operatingDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(nowISO()));
  if (event === 'CHECK_IN' && live.checkIn > operatingDay) return { ok: false, error: 'Check-in is not available before the recorded stay start date.' };
  if (event === 'CLOSE' && (!db.shortletInspections.some((inspection) => inspection.tenantId === live.tenantId && inspection.bookingId === live.id) || ['pending', 'held'].includes(live.cautionStatus))) return { ok: false, error: 'Record the checkout inspection and caution decision before closing.' };

  const from = live.status;
  live.status = t.to;
  if (t.to === 'cancelled' && live.cautionStatus === 'held') live.cautionStatus = 'refunded';
  recordHistory('shortlet-booking', live.id, { at: nowISO(), event, from, to: t.to, actorId: g.actor.userId, actorName: 'Operator', actorRole: roles[0] ?? 'estate_manager' });
  revalidate();
  return { ok: true, ref: live.ref };

  });
}

/* --- record an off-platform payment (FR-BM-02) ---------------------------- */
export async function recordPayment(id: string, amountNaira: number): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const live = scopedMutableGet(g.actor, 'bookings_amenities', db.shortletBookings, id, 'update');
  if (!live) return { ok: false, error: 'Booking not found.' };
  const add = minorAmount(amountNaira);
  if (add === null || add <= 0) return { ok: false, error: 'Enter a finite amount greater than zero.' };
  if (live.total.currency !== 'NGN' || live.paid.currency !== 'NGN') return { ok: false, error: 'This form records NGN only; currencies must match.' };
  if (live.status === 'cancelled') return { ok: false, error: 'A cancelled booking needs a separate financial adjustment.' };
  if (add > live.total.minor - live.paid.minor) return { ok: false, error: 'The payment exceeds the recorded outstanding balance.' };
  live.paid = money(live.paid.minor + add, 'NGN');
  recordHistory('shortlet-booking', live.id, { at: nowISO(), event: 'PAYMENT_RECORDED', from: live.status, to: live.status, actorId: g.actor.userId, actorName: 'Operator', actorRole: (g.actor.roles[0] as Role) ?? 'estate_manager', note: `₦${amountNaira.toLocaleString()} recorded` });
  revalidate();
  return { ok: true };

  });
}

/* --- checkout inspection → caution decision (FR-CI) ----------------------- */
export async function saveInspection(bookingId: string, items: InspectionItem[], inspectorName: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const live = scopedMutableGet(g.actor, 'bookings_amenities', db.shortletBookings, bookingId, 'update');
  if (!live) return { ok: false, error: 'Booking not found.' };
  if (live.status !== 'checked_out') return { ok: false, error: 'Only a checked-out booking can receive its closing inspection.' };
  if (!Array.isArray(items) || items.length === 0 || items.length > 100 || items.some((item) => !item.label?.trim() || !['ok', 'damaged', 'missing'].includes(item.condition) || item.chargeMinor !== undefined && (!Number.isSafeInteger(item.chargeMinor) || item.chargeMinor < 0))) return { ok: false, error: 'Record valid inspection items and non-negative whole-kobo charges.' };
  if (live.cautionFee.currency !== 'NGN') return { ok: false, error: 'This inspection form records NGN caution decisions only.' };

  const damageTotal = items.reduce((n, it) => n + (it.condition !== 'ok' ? it.chargeMinor ?? 0 : 0), 0);
  if (!Number.isSafeInteger(damageTotal)) return { ok: false, error: 'The total inspection charge is too large.' };
  const outcome: SlInspection['outcome'] = damageTotal > 0 ? 'deductions' : 'clear';
  const insp = { tenantId: g.actor.tenantId, id: `si-${bookingId}`, bookingId, apartmentId: live.apartmentId, inspectorName: inspectorName || 'Operator', at: nowISO(), items, outcome, damageTotal: money(damageTotal, 'NGN') } as unknown as SlInspection;
  const existing = db.shortletInspections.findIndex((i) => i.tenantId === g.actor.tenantId && i.bookingId === bookingId);
  if (existing >= 0) db.shortletInspections[existing] = insp; else db.shortletInspections.unshift(insp);

  // Drive the caution decision + close the booking (FR-CI-03).
  live.cautionDeducted = money(Math.min(damageTotal, live.cautionFee.minor), 'NGN');
  live.cautionStatus = damageTotal <= 0 ? 'refunded' : damageTotal >= live.cautionFee.minor ? 'forfeited' : 'partly_deducted';
  const from = live.status;
  if (live.status === 'checked_out') live.status = 'closed';
  recordHistory('shortlet-booking', live.id, { at: nowISO(), event: 'CLOSE', from, to: live.status, actorId: g.actor.userId, actorName: 'Operator', actorRole: (g.actor.roles[0] as Role) ?? 'estate_manager', note: outcome === 'clear' ? 'Caution refunded in full' : `₦${(damageTotal / 100).toLocaleString()} deducted` });
  revalidate();
  return { ok: true };

  });
}

/* --- FR-IC: connect / disconnect an iCal channel on an apartment ---------- */
export async function toggleChannel(apartmentId: string, channel: Channel): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  if (!['airbnb', 'booking_com', 'google'].includes(channel)) return { ok: false, error: 'Choose a supported channel.' };
  const live = scopedMutableGet(g.actor, 'bookings_amenities', db.shortletApartments, apartmentId, 'update');
  if (!live) return { ok: false, error: 'Apartment not found.' };
  live.channels = live.channels.includes(channel) ? live.channels.filter((c) => c !== channel) : [...live.channels, channel];
  revalidate();
  return { ok: true };

  });
}

/* --- FR-PL: change subscription plan -------------------------------------- */
export async function changePlan(planKey: PlanKey): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  if (!['lite', 'starter', 'growth', 'pro', 'enterprise'].includes(planKey)) return { ok: false, error: 'Choose a valid plan.' };
  if (repos.shortletApartments.list(g.actor, { limit: Number.MAX_SAFE_INTEGER }).total > planFor(planKey).apartmentCap) return { ok: false, error: 'Select a plan that covers the recorded apartment count.' };
  shortletSettings(g.actor.tenantId).planKey = planKey;
  revalidate();
  return { ok: true };

  });
}

/* --- FR-TM: team management ------------------------------------------------ */
export async function inviteMember(input: { name: string; phone: string; role: TeamRole }): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('create'); if ('ok' in g) return g;
  if (!input.name.trim()) return { ok: false, error: 'Name is required.' };
  if (!teamRoles.includes(input.role)) return { ok: false, error: 'Choose a valid team role. Owner access cannot be assigned here.' };
  db.shortletTeam.push({ tenantId: g.actor.tenantId, id: `tm-new-${nextRecordSequence('shortlet:tmSeq', 0, true)}`, name: input.name.trim(), phone: input.phone.trim(), role: input.role, status: 'invited', lastActive: '—' } as unknown as TeamMember);
  revalidate();
  return { ok: true };

  });
}

export async function setMemberRole(id: string, role: TeamRole): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const m = scopedMutableGet(g.actor, 'bookings_amenities', db.shortletTeam, id, 'update');
  if (!m) return { ok: false, error: 'Member not found.' };
  if (!teamRoles.includes(role)) return { ok: false, error: 'Choose a valid team role. Owner access cannot be assigned here.' };
  if (m.role === 'owner') return { ok: false, error: 'The owner role cannot be changed here.' };
  m.role = role;
  revalidate();
  return { ok: true };

  });
}

export async function removeMember(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const m = scopedMutableGet(g.actor, 'bookings_amenities', db.shortletTeam, id, 'update');
  if (!m) return { ok: false, error: 'Member not found.' };
  if (m.role === 'owner') return { ok: false, error: 'You cannot remove the account owner.' };
  db.shortletTeam = db.shortletTeam.filter((x) => x !== m);
  revalidate();
  return { ok: true };

  });
}

/* --- dynamic pricing: seasonal rate rules --------------------------------- */
export async function addPricingRule(input: { apartmentId: string; label: string; fromISO: string; toISO: string; type: RuleType; amountNaira?: number; pct?: number }): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('create'); if ('ok' in g) return g;
  if (!scopedMutableGet(g.actor, 'bookings_amenities', db.shortletApartments, input.apartmentId, 'create')) return { ok: false, error: 'Apartment not found.' };
  if (!input.label.trim()) return { ok: false, error: 'Give the rule a label.' };
  if (!validDate(input.fromISO) || !validDate(input.toISO)) return { ok: false, error: 'Enter valid pricing-rule dates.' };
  if (Date.parse(input.toISO) < Date.parse(input.fromISO)) return { ok: false, error: 'End date must be after start date.' };
  if (!['fixed', 'increase', 'decrease'].includes(input.type) || input.type === 'fixed' && (minorAmount(input.amountNaira ?? NaN) === null || !(input.amountNaira! > 0)) || input.type !== 'fixed' && (!Number.isFinite(input.pct) || input.pct! < 0 || input.type === 'decrease' && input.pct! > 100)) return { ok: false, error: 'Enter a valid positive fixed rate or a finite percentage; discounts cannot exceed 100%.' };
  db.shortletPricingRules.unshift({ tenantId: g.actor.tenantId, id: `pr-new-${nextRecordSequence('shortlet:prSeq', 0, true)}`, apartmentId: input.apartmentId, label: input.label.trim(), fromISO: input.fromISO, toISO: input.toISO, type: input.type, amountMinor: input.type === 'fixed' ? Math.round((input.amountNaira ?? 0) * 100) : undefined, pct: input.type !== 'fixed' ? input.pct : undefined } as unknown as PricingRule);
  revalidate();
  return { ok: true };

  });
}
export async function removePricingRule(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const rule = scopedMutableGet(g.actor, 'bookings_amenities', db.shortletPricingRules, id, 'update');
  if (!rule) return { ok: false, error: 'Pricing rule not found.' };
  db.shortletPricingRules = db.shortletPricingRules.filter((r) => r !== rule);
  revalidate();
  return { ok: true };

  });
}

/* --- maintenance issue tracker -------------------------------------------- */
export async function logIssue(input: { apartmentId: string; title: string; description: string; priority: IssuePriority }): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('create'); if ('ok' in g) return g;
  if (!input.title.trim()) return { ok: false, error: 'Describe the issue.' };
  if (!scopedMutableGet(g.actor, 'bookings_amenities', db.shortletApartments, input.apartmentId, 'create')) return { ok: false, error: 'Apartment not found.' };
  if (!['low', 'medium', 'high', 'urgent'].includes(input.priority)) return { ok: false, error: 'Choose a valid priority.' };
  db.shortletIssues.unshift({ tenantId: g.actor.tenantId, id: `mi-new-${nextRecordSequence('shortlet:miSeq', 0, true)}`, apartmentId: input.apartmentId, title: input.title.trim(), description: input.description.trim(), priority: input.priority ?? suggestPriority(input.title), status: 'open', createdAt: NOW } as unknown as MaintenanceIssue);
  revalidate();
  return { ok: true };

  });
}
export async function advanceIssue(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const issue = scopedMutableGet(g.actor, 'bookings_amenities', db.shortletIssues, id, 'update');
  if (!issue) return { ok: false, error: 'Issue not found.' };
  const next = ISSUE_NEXT[issue.status];
  if (!next) return { ok: false, error: 'Already resolved.' };
  issue.status = next.to;
  if (next.to === 'resolved') issue.resolvedAt = NOW;
  revalidate();
  return { ok: true };

  });
}

/* --- direct booking page -------------------------------------------------- */
export async function toggleBookingPage(): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const config = shortletSettings(g.actor.tenantId).bookingPage;
  config.enabled = !config.enabled;
  revalidate();
  return { ok: true };

  });
}
export async function saveBookingPage(input: { slug: string; cancellationPolicy: string; holdHours: number }): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) return { ok: false, error: 'Choose a link name.' };
  if (!Number.isFinite(input.holdHours) || input.holdHours < 0 || input.holdHours > 48) return { ok: false, error: 'Enter a hold window from 0 to 48 hours.' };
  const config = shortletSettings(g.actor.tenantId).bookingPage;
  config.slug = slug;
  config.cancellationPolicy = input.cancellationPolicy.trim();
  config.holdHours = Math.round(input.holdHours);
  revalidate();
  return { ok: true };

  });
}
export async function addPromoCode(input: { code: string; pct: number }): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return { ok: false, error: 'Enter a code.' };
  if (!Number.isFinite(input.pct) || input.pct < 1 || input.pct > 90) return { ok: false, error: 'Enter a discount from 1% to 90%.' };
  const config = shortletSettings(g.actor.tenantId).bookingPage;
  if (config.promoCodes.some((p) => p.code === code)) return { ok: false, error: 'That code already exists.' };
  config.promoCodes.unshift({ code, pct: Math.round(input.pct), active: true });
  revalidate();
  return { ok: true };

  });
}
export async function togglePromoCode(code: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('update'); if ('ok' in g) return g;
  const p = shortletSettings(g.actor.tenantId).bookingPage.promoCodes.find((x) => x.code === code);
  if (!p) return { ok: false, error: 'Code not found.' };
  p.active = !p.active;
  revalidate();
  return { ok: true };

  });
}

/* --- agents --------------------------------------------------------------- */
export async function inviteAgent(input: { name: string; phone: string; commissionPct: number }): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('create'); if ('ok' in g) return g;
  if (!input.name.trim()) return { ok: false, error: 'Agent name is required.' };
  if (!Number.isFinite(input.commissionPct) || input.commissionPct < 0 || input.commissionPct > 30) return { ok: false, error: 'Enter a commission from 0% to 30%.' };
  db.shortletAgents.push({ tenantId: g.actor.tenantId, id: `ag-new-${nextRecordSequence('shortlet:agSeq', 0, true)}`, name: input.name.trim(), phone: input.phone.trim(), commissionPct: Math.max(0, Math.min(30, input.commissionPct || 0)), status: 'invited' } as unknown as Agent);
  revalidate();
  return { ok: true };

  });
}

/* --- log an expense (FR-EX-01) -------------------------------------------- */
export async function logExpense(input: { propertyId: string; category: ExpenseCategory; amountNaira: number; date: string; note: string }): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('create'); if ('ok' in g) return g;
  const amountMinor = minorAmount(input.amountNaira);
  if (amountMinor === null || amountMinor <= 0) return { ok: false, error: 'Enter a finite amount greater than zero.' };
  if (!validDate(input.date)) return { ok: false, error: 'Enter a valid expense date.' };
  if (!scopedMutableGet(g.actor, 'bookings_amenities', db.shortletProperties, input.propertyId, 'create')) return { ok: false, error: 'Property not found.' };
  if (!['diesel', 'salary', 'repairs', 'supplies', 'cleaning', 'utilities', 'marketing', 'other'].includes(input.category)) return { ok: false, error: 'Choose a valid expense category.' };
  db.shortletExpenses.unshift({ tenantId: g.actor.tenantId, id: `se-new-${randomUUID()}`, propertyId: input.propertyId, category: input.category, amount: money(amountMinor, 'NGN'), date: input.date, note: input.note.trim() || input.category } as never);
  revalidate();
  return { ok: true };

  });
}

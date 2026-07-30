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
import type { SlBooking, SlInspection, InspectionItem, ExpenseCategory, BookingSource, Channel } from '@/domain/shortlet/types';
import type { PlanKey, TeamRole, TeamMember } from '@/domain/shortlet/plan';
import { suggestPriority, ISSUE_NEXT, type RuleType, type IssuePriority, type PricingRule, type MaintenanceIssue, type Agent } from '@/domain/shortlet/operations';

const PATHS = ['/shortlet', '/shortlet/bookings', '/shortlet/calendar', '/shortlet/inspections', '/shortlet/expenses', '/shortlet/analytics', '/shortlet/guests', '/shortlet/whatsapp', '/shortlet/channels', '/shortlet/plan', '/shortlet/team', '/shortlet/pricing', '/shortlet/maintenance', '/shortlet/agents', '/shortlet/reviews'];
const revalidate = () => PATHS.forEach((p) => revalidatePath(p));

export type Res = { ok: true; ref?: string } | { ok: false; error: string };

async function gate(action: 'create' | 'update' | 'transition'): Promise<{ actor: Awaited<ReturnType<typeof getActor>> } | { ok: false; error: string }> {
  const actor = await getActor();
  try { assertCan(actor, 'bookings_amenities', action); return { actor }; }
  catch (e) { if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot manage short-let bookings.' }; throw e; }
}

let seq = 5200;

/* --- create a booking (FR-BM-01) ------------------------------------------ */
export async function createBooking(input: { apartmentId: string; guestName: string; guestPhone: string; guestEmail?: string; checkIn: string; checkOut: string; source: BookingSource; agentName?: string; status?: string; cautionNaira: number; paidNaira?: number; specialRequests?: string }): Promise<Res> {
  const g = await gate('create'); if ('ok' in g) return g;
  const apt = repos.shortletApartments.list(g.actor).items.find((a) => a.id === input.apartmentId);
  if (!apt) return { ok: false, error: 'Apartment not found.' };
  if (!input.guestName.trim()) return { ok: false, error: 'Guest name is required.' };
  if (Date.parse(input.checkOut) <= Date.parse(input.checkIn)) return { ok: false, error: 'Check-out must be after check-in.' };

  const nights = nightsBetween(input.checkIn, input.checkOut);
  const totalMinor = nights * apt.nightlyRate.minor;
  const ref = `SL-${seq++}`;
  const status = input.status === 'confirmed' ? 'confirmed' : 'enquiry';
  const booking = {
    tenantId: g.actor.tenantId, id: `slb-new-${ref}`, ref, apartmentId: apt.id, propertyId: apt.propertyId,
    guestName: input.guestName.trim(), guestPhone: input.guestPhone.trim(), guestEmail: input.guestEmail?.trim() || undefined,
    checkIn: input.checkIn, checkOut: input.checkOut, nights, source: input.source, agentName: input.agentName?.trim() || undefined,
    nightlyRate: apt.nightlyRate, total: money(totalMinor, 'NGN'), paid: money(Math.min(totalMinor, Math.round((input.paidNaira ?? 0) * 100)), 'NGN'),
    cautionFee: money(Math.round(input.cautionNaira * 100), 'NGN'), cautionStatus: 'held', cautionDeducted: money(0, 'NGN'),
    status, guestToken: `g-${ref}`, specialRequests: input.specialRequests?.trim() || undefined, createdAt: NOW,
  } as unknown as SlBooking;

  db.shortletBookings.unshift(booking);
  recordHistory('shortlet-booking', booking.id, { at: NOW, event: 'CREATE', from: null, to: status, actorId: g.actor.userId, actorName: 'Operator', actorRole: (g.actor.roles[0] as Role) ?? 'estate_manager', note: `${apt.name} · ${nights} nights` });
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

/* --- FR-IC: connect / disconnect an iCal channel on an apartment ---------- */
export async function toggleChannel(apartmentId: string, channel: Channel): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const owned = repos.shortletApartments.list(g.actor).items.find((a) => a.id === apartmentId);
  if (!owned) return { ok: false, error: 'Apartment not found.' };
  const live = db.shortletApartments.find((a) => a.id === apartmentId);
  if (!live) return { ok: false, error: 'Apartment not found.' };
  live.channels = live.channels.includes(channel) ? live.channels.filter((c) => c !== channel) : [...live.channels, channel];
  revalidate();
  return { ok: true };
}

/* --- FR-PL: change subscription plan -------------------------------------- */
export async function changePlan(planKey: PlanKey): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  db.shortletPlanKey = planKey;
  revalidate();
  return { ok: true };
}

/* --- FR-TM: team management ------------------------------------------------ */
let tmSeq = 0;
export async function inviteMember(input: { name: string; phone: string; role: TeamRole }): Promise<Res> {
  const g = await gate('create'); if ('ok' in g) return g;
  if (!input.name.trim()) return { ok: false, error: 'Name is required.' };
  db.shortletTeam.push({ tenantId: g.actor.tenantId, id: `tm-new-${++tmSeq}`, name: input.name.trim(), phone: input.phone.trim(), role: input.role, status: 'invited', lastActive: '—' } as unknown as TeamMember);
  revalidate();
  return { ok: true };
}

export async function setMemberRole(id: string, role: TeamRole): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const m = db.shortletTeam.find((x) => x.id === id);
  if (!m) return { ok: false, error: 'Member not found.' };
  if (m.role === 'owner') return { ok: false, error: 'The owner role cannot be changed here.' };
  m.role = role;
  revalidate();
  return { ok: true };
}

export async function removeMember(id: string): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const m = db.shortletTeam.find((x) => x.id === id);
  if (!m) return { ok: false, error: 'Member not found.' };
  if (m.role === 'owner') return { ok: false, error: 'You cannot remove the account owner.' };
  db.shortletTeam = db.shortletTeam.filter((x) => x.id !== id);
  revalidate();
  return { ok: true };
}

/* --- dynamic pricing: seasonal rate rules --------------------------------- */
let prSeq = 0;
export async function addPricingRule(input: { apartmentId: string; label: string; fromISO: string; toISO: string; type: RuleType; amountNaira?: number; pct?: number }): Promise<Res> {
  const g = await gate('create'); if ('ok' in g) return g;
  if (!repos.shortletApartments.list(g.actor).items.some((a) => a.id === input.apartmentId)) return { ok: false, error: 'Apartment not found.' };
  if (!input.label.trim()) return { ok: false, error: 'Give the rule a label.' };
  if (Date.parse(input.toISO) < Date.parse(input.fromISO)) return { ok: false, error: 'End date must be after start date.' };
  db.shortletPricingRules.unshift({ tenantId: g.actor.tenantId, id: `pr-new-${++prSeq}`, apartmentId: input.apartmentId, label: input.label.trim(), fromISO: input.fromISO, toISO: input.toISO, type: input.type, amountMinor: input.type === 'fixed' ? Math.round((input.amountNaira ?? 0) * 100) : undefined, pct: input.type !== 'fixed' ? input.pct : undefined } as unknown as PricingRule);
  revalidate();
  return { ok: true };
}
export async function removePricingRule(id: string): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  db.shortletPricingRules = db.shortletPricingRules.filter((r) => r.id !== id);
  revalidate();
  return { ok: true };
}

/* --- maintenance issue tracker -------------------------------------------- */
let miSeq = 0;
export async function logIssue(input: { apartmentId: string; title: string; description: string; priority: IssuePriority }): Promise<Res> {
  const g = await gate('create'); if ('ok' in g) return g;
  if (!input.title.trim()) return { ok: false, error: 'Describe the issue.' };
  db.shortletIssues.unshift({ tenantId: g.actor.tenantId, id: `mi-new-${++miSeq}`, apartmentId: input.apartmentId, title: input.title.trim(), description: input.description.trim(), priority: input.priority ?? suggestPriority(input.title), status: 'open', createdAt: NOW } as unknown as MaintenanceIssue);
  revalidate();
  return { ok: true };
}
export async function advanceIssue(id: string): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const issue = db.shortletIssues.find((i) => i.id === id);
  if (!issue) return { ok: false, error: 'Issue not found.' };
  const next = ISSUE_NEXT[issue.status];
  if (!next) return { ok: false, error: 'Already resolved.' };
  issue.status = next.to;
  if (next.to === 'resolved') issue.resolvedAt = NOW;
  revalidate();
  return { ok: true };
}

/* --- direct booking page -------------------------------------------------- */
export async function toggleBookingPage(): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  db.shortletBookingPage.enabled = !db.shortletBookingPage.enabled;
  revalidate();
  return { ok: true };
}
export async function saveBookingPage(input: { slug: string; cancellationPolicy: string; holdHours: number }): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug) return { ok: false, error: 'Choose a link name.' };
  db.shortletBookingPage.slug = slug;
  db.shortletBookingPage.cancellationPolicy = input.cancellationPolicy.trim();
  db.shortletBookingPage.holdHours = Math.max(0, Math.min(48, Math.round(input.holdHours || 0)));
  revalidate();
  return { ok: true };
}
export async function addPromoCode(input: { code: string; pct: number }): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const code = input.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!code) return { ok: false, error: 'Enter a code.' };
  if (db.shortletBookingPage.promoCodes.some((p) => p.code === code)) return { ok: false, error: 'That code already exists.' };
  db.shortletBookingPage.promoCodes.unshift({ code, pct: Math.max(1, Math.min(90, Math.round(input.pct || 0))), active: true });
  revalidate();
  return { ok: true };
}
export async function togglePromoCode(code: string): Promise<Res> {
  const g = await gate('update'); if ('ok' in g) return g;
  const p = db.shortletBookingPage.promoCodes.find((x) => x.code === code);
  if (!p) return { ok: false, error: 'Code not found.' };
  p.active = !p.active;
  revalidate();
  return { ok: true };
}

/* --- agents --------------------------------------------------------------- */
let agSeq = 0;
export async function inviteAgent(input: { name: string; phone: string; commissionPct: number }): Promise<Res> {
  const g = await gate('create'); if ('ok' in g) return g;
  if (!input.name.trim()) return { ok: false, error: 'Agent name is required.' };
  db.shortletAgents.push({ tenantId: g.actor.tenantId, id: `ag-new-${++agSeq}`, name: input.name.trim(), phone: input.phone.trim(), commissionPct: Math.max(0, Math.min(30, input.commissionPct || 0)), status: 'invited' } as unknown as Agent);
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

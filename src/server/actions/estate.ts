'use server';

/**
 * Estate Experience actions. Each re-checks its §7 capability server-side
 * (deny-by-default): community feedback/complaints → announcements; collections
 * dunning → charges_invoicing; tenancy lifecycle → users_roles; parcels → security_sos.
 * The estate manager holds M on all four, so these are their day-to-day tools.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, type Capability } from '@/lib/authz';
import { db } from '@/server/data/store';
import { NOW } from '@/domain/ppm';
import { nextDunningStage, nextTenancyStage, motionOutcome, isEventFull, tierFor, EARN_POINTS, type VoteChoice, type EarnReason } from '@/domain/estate';

const PATHS = ['/community', '/collections', '/tenancy', '/parcels', '/governance', '/events', '/rewards', '/billing', '/people', '/dashboard'];
const revalidate = () => PATHS.forEach((p) => revalidatePath(p));

export type Res = { ok: true; ref?: string } | { ok: false; error: string };

async function gate(capability: Capability, action: 'update' | 'create' = 'update'): Promise<{ ok: true } | { ok: false; error: string }> {
  const actor = await getActor();
  try { assertCan(actor, capability, action); return { ok: true }; }
  catch (e) { if (e instanceof ForbiddenError) return { ok: false, error: 'You do not have permission for this.' }; throw e; }
}

/* --- community ------------------------------------------------------------ */
export async function acknowledgeFeedback(id: string): Promise<Res> {
  const g = await gate('announcements'); if (!g.ok) return g;
  const f = db.residentFeedback.find((x) => x.id === id);
  if (!f) return { ok: false, error: 'Feedback not found.' };
  f.acknowledged = true;
  revalidate();
  return { ok: true };
}

export async function resolveComplaint(id: string): Promise<Res> {
  const g = await gate('announcements'); if (!g.ok) return g;
  const c = db.complaints.find((x) => x.id === id);
  if (!c) return { ok: false, error: 'Complaint not found.' };
  c.status = 'resolved';
  revalidate();
  return { ok: true };
}

/* --- collections ---------------------------------------------------------- */
export async function sendReminder(caseId: string): Promise<Res> {
  const g = await gate('charges_invoicing'); if (!g.ok) return g;
  const c = db.collectionCases.find((x) => x.id === caseId);
  if (!c) return { ok: false, error: 'Case not found.' };
  c.remindersSent += 1; c.lastActionISO = NOW;
  revalidate();
  return { ok: true, ref: c.invoiceRef };
}

export async function advanceDunning(caseId: string): Promise<Res> {
  const g = await gate('charges_invoicing'); if (!g.ok) return g;
  const c = db.collectionCases.find((x) => x.id === caseId);
  if (!c) return { ok: false, error: 'Case not found.' };
  c.stage = nextDunningStage(c.stage); c.lastActionISO = NOW;
  revalidate();
  return { ok: true, ref: c.invoiceRef };
}

export async function recordPromise(caseId: string, amountMajor: number, dueISO: string): Promise<Res> {
  const g = await gate('charges_invoicing'); if (!g.ok) return g;
  const c = db.collectionCases.find((x) => x.id === caseId);
  if (!c) return { ok: false, error: 'Case not found.' };
  if (!(amountMajor > 0)) return { ok: false, error: 'Enter an amount greater than zero.' };
  if (!dueISO) return { ok: false, error: 'Pick a promise date.' };
  c.promiseAmountMinor = Math.round(amountMajor * 100); c.promiseDueISO = dueISO; c.promiseStatus = 'pending';
  c.stage = 'plan'; c.lastActionISO = NOW;
  revalidate();
  return { ok: true, ref: c.invoiceRef };
}

/* --- tenancy -------------------------------------------------------------- */
export async function advanceTenancy(id: string): Promise<Res> {
  const g = await gate('users_roles'); if (!g.ok) return g;
  const t = db.tenancies.find((x) => x.id === id);
  if (!t) return { ok: false, error: 'Tenancy not found.' };
  t.stage = nextTenancyStage(t.stage);
  if (t.stage === 'active' && !t.moveInISO) t.moveInISO = NOW;
  if (t.stage === 'moving_in' && t.depositStatus === 'pending') t.depositStatus = 'held';
  revalidate();
  return { ok: true };
}

export async function settleDeposit(id: string, refundMajor: number): Promise<Res> {
  const g = await gate('users_roles'); if (!g.ok) return g;
  const t = db.tenancies.find((x) => x.id === id);
  if (!t) return { ok: false, error: 'Tenancy not found.' };
  const refundMinor = Math.round(Math.max(0, refundMajor) * 100);
  if (refundMinor > t.depositMinor) return { ok: false, error: 'Refund cannot exceed the deposit held.' };
  t.depositStatus = refundMinor === 0 ? 'withheld' : refundMinor >= t.depositMinor ? 'refunded' : 'partially_refunded';
  revalidate();
  return { ok: true };
}

/* --- parcels -------------------------------------------------------------- */
let pcSeq = 0;
export type LogParcelInput = { residentName: string; unitLabel: string; courier: string; size: 'S' | 'M' | 'L' };

export async function logParcel(input: LogParcelInput): Promise<Res> {
  const g = await gate('security_sos', 'create'); if (!g.ok) return g;
  if (!input.residentName?.trim()) return { ok: false, error: 'Enter the resident name.' };
  const code = `PKG-${7745 + db.parcels.length}`;
  // Assign the first free locker of the right size (else leave awaiting at the desk).
  const locker = db.lockers.find((l) => !l.parcelId && l.size === input.size) ?? db.lockers.find((l) => !l.parcelId);
  const id = `pc-new-${++pcSeq}`;
  db.parcels.unshift({
    tenantId: db.parcels[0]?.tenantId ?? 't-lekki', id, estateId: (db.parcels[0]?.estateId as string) ?? 's-gardens',
    code, residentName: input.residentName.trim(), unitLabel: input.unitLabel.trim() || '—', courier: input.courier.trim() || 'Courier',
    lockerLabel: locker?.label, size: input.size, status: locker ? 'stored' : 'received', receivedISO: new Date(Date.parse(NOW)).toISOString(),
  } as (typeof db.parcels)[number]);
  if (locker) locker.parcelId = id;
  revalidate();
  return { ok: true, ref: code };
}

export async function collectParcel(id: string): Promise<Res> {
  const g = await gate('security_sos'); if (!g.ok) return g;
  const p = db.parcels.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'Parcel not found.' };
  if (p.status === 'collected') return { ok: false, error: 'Already collected.' };
  p.status = 'collected'; p.collectedISO = new Date(Date.parse(NOW)).toISOString();
  const locker = db.lockers.find((l) => l.parcelId === id);
  if (locker) locker.parcelId = undefined;
  revalidate();
  return { ok: true, ref: p.code };
}

export async function notifyResident(id: string): Promise<Res> {
  const g = await gate('security_sos'); if (!g.ok) return g;
  const p = db.parcels.find((x) => x.id === id);
  if (!p) return { ok: false, error: 'Parcel not found.' };
  revalidate();
  return { ok: true, ref: p.code };
}

/* --- governance & e-voting ------------------------------------------------ */
export async function openMotion(id: string): Promise<Res> {
  const g = await gate('announcements'); if (!g.ok) return g;
  const m = db.motions.find((x) => x.id === id);
  if (!m) return { ok: false, error: 'Motion not found.' };
  if (m.status !== 'draft') return { ok: false, error: 'Only a draft can be opened.' };
  m.status = 'open';
  revalidate();
  return { ok: true, ref: m.ref };
}

/** Record a unit's vote (unit-weighted). One click = one unit's weight. */
export async function castVote(motionId: string, choice: VoteChoice): Promise<Res> {
  const g = await gate('announcements'); if (!g.ok) return g;
  const m = db.motions.find((x) => x.id === motionId);
  if (!m) return { ok: false, error: 'Motion not found.' };
  if (m.status !== 'open') return { ok: false, error: 'Voting is not open on this motion.' };
  if (choice === 'for') m.forWeight += 1; else if (choice === 'against') m.againstWeight += 1; else m.abstainWeight += 1;
  revalidate();
  return { ok: true, ref: m.ref };
}

export async function closeMotion(id: string): Promise<Res> {
  const g = await gate('announcements'); if (!g.ok) return g;
  const m = db.motions.find((x) => x.id === id);
  if (!m) return { ok: false, error: 'Motion not found.' };
  if (m.status !== 'open') return { ok: false, error: 'Only an open motion can be closed.' };
  m.status = motionOutcome(m);
  revalidate();
  return { ok: true, ref: m.ref };
}

/* --- events & amenities --------------------------------------------------- */
export async function rsvpEvent(id: string): Promise<Res> {
  const g = await gate('bookings_amenities'); if (!g.ok) return g;
  const e = db.communityEvents.find((x) => x.id === id);
  if (!e) return { ok: false, error: 'Event not found.' };
  if (e.cancelled) return { ok: false, error: 'This event was cancelled.' };
  if (isEventFull(e)) return { ok: false, error: 'This event is full.' };
  e.rsvps += 1;
  revalidate();
  return { ok: true };
}

export async function cancelRsvp(id: string): Promise<Res> {
  const g = await gate('bookings_amenities'); if (!g.ok) return g;
  const e = db.communityEvents.find((x) => x.id === id);
  if (!e) return { ok: false, error: 'Event not found.' };
  if (e.rsvps > 0) e.rsvps -= 1;
  revalidate();
  return { ok: true };
}

let evSeq = 0;
export type CreateEventInput = { title: string; category: 'social' | 'fitness' | 'kids' | 'meeting' | 'festive'; venue: string; host: string; startISO: string; capacity: number };
export async function createEvent(input: CreateEventInput): Promise<Res> {
  const g = await gate('bookings_amenities', 'create'); if (!g.ok) return g;
  if (!input.title?.trim()) return { ok: false, error: 'Enter an event title.' };
  if (!(input.capacity > 0)) return { ok: false, error: 'Capacity must be greater than zero.' };
  const start = input.startISO ? new Date(`${input.startISO}T18:00:00Z`).toISOString() : new Date(Date.parse(NOW)).toISOString();
  const end = new Date(Date.parse(start) + 2 * 3600 * 1000).toISOString();
  db.communityEvents.unshift({
    tenantId: db.communityEvents[0]?.tenantId ?? 't-lekki', id: `ev-new-${++evSeq}`, estateId: (db.communityEvents[0]?.estateId as string) ?? 's-gardens',
    title: input.title.trim(), category: input.category, venue: input.venue.trim() || 'Clubhouse Hall', host: input.host.trim() || 'Estate Office',
    startISO: start, endISO: end, capacity: Math.round(input.capacity), rsvps: 0,
  } as (typeof db.communityEvents)[number]);
  revalidate();
  return { ok: true, ref: input.title.trim() };
}

/* --- board & committee ---------------------------------------------------- */
let moSeq = 0;
export type CreateMotionInput = { title: string; summary: string; category: 'budget' | 'rule' | 'works' | 'board'; quorumPct: number; thresholdPct: number };
export async function createMotion(input: CreateMotionInput): Promise<Res> {
  const g = await gate('announcements', 'create'); if (!g.ok) return g;
  if (!input.title?.trim()) return { ok: false, error: 'Enter a motion title.' };
  const seq = db.motions.length + (++moSeq);
  const first = db.motions[0];
  db.motions.push({
    tenantId: first?.tenantId ?? 't-lekki', id: `mo-new-${moSeq}`, estateId: (first?.estateId as string) ?? 's-gardens',
    ref: `AGM-${String(seq).padStart(2, '0')}`, title: input.title.trim(), summary: input.summary.trim() || 'Motion tabled by the committee.',
    category: input.category, status: 'draft', opensISO: NOW.slice(0, 10), closesISO: NOW.slice(0, 10),
    eligibleWeight: 240, forWeight: 0, againstWeight: 0, abstainWeight: 0,
    quorumPct: Math.min(100, Math.max(1, Math.round(input.quorumPct || 33))), thresholdPct: Math.min(100, Math.max(1, Math.round(input.thresholdPct || 50))),
  } as (typeof db.motions)[number]);
  revalidate();
  return { ok: true, ref: `AGM-${String(seq).padStart(2, '0')}` };
}

export async function recordMeetingHeld(id: string, attendees: number): Promise<Res> {
  const g = await gate('announcements'); if (!g.ok) return g;
  const m = db.meetings.find((x) => x.id === id);
  if (!m) return { ok: false, error: 'Meeting not found.' };
  m.status = 'held'; m.attendees = Math.max(0, Math.round(attendees));
  revalidate();
  return { ok: true, ref: m.title };
}

/* --- loyalty & rewards ---------------------------------------------------- */
export async function awardPoints(memberId: string, reason: EarnReason): Promise<Res> {
  const g = await gate('announcements'); if (!g.ok) return g;
  const m = db.rewardMembers.find((x) => x.id === memberId);
  if (!m) return { ok: false, error: 'Member not found.' };
  m.points += EARN_POINTS[reason];
  m.lastEarnedISO = NOW;
  if (reason === 'on_time_payment') m.onTimeStreak += 1;
  if (reason === 'event') m.eventsAttended += 1;
  if (reason === 'poll') m.pollsVoted += 1;
  revalidate();
  return { ok: true };
}

export async function redeemPerk(memberId: string, perkId: string): Promise<Res> {
  const g = await gate('announcements'); if (!g.ok) return g;
  const m = db.rewardMembers.find((x) => x.id === memberId);
  const p = db.perks.find((x) => x.id === perkId);
  if (!m || !p) return { ok: false, error: 'Member or perk not found.' };
  if (p.stock <= 0) return { ok: false, error: 'That perk is out of stock.' };
  if (m.points < p.cost) return { ok: false, error: `${m.residentName} needs ${p.cost - m.points} more points.` };
  m.points -= p.cost; p.stock -= 1;
  const _tier = tierFor(m.points); void _tier;
  revalidate();
  return { ok: true, ref: p.title };
}

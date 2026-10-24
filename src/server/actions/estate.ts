'use server';

import { withDurableMutation } from '@/server/data/durable-records';

import { nextRecordSequence } from '@/server/data/record-context';

/**
 * Estate Experience actions. Each re-checks its §7 capability server-side
 * (deny-by-default): community feedback/complaints → announcements; collections
 * dunning → charges_invoicing; tenancy lifecycle → users_roles; parcels → security_sos.
 * The estate manager holds M on all four, so these are their day-to-day tools.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan, matchesScope, type Actor, type Capability, type ScopeFilter, type ScopableRow } from '@/lib/authz';
import { db, recordProxyReturnNotice } from '@/server/data/store';
import { operatingDateISO, operatingNowISO, operatingNowMs } from '@/server/operating-clock';
import { nextDunningStage, nextTenancyStage, motionOutcome, motionTally, isEventFull, tierFor, EARN_POINTS, electionWinner, cascadeRevokeUpstream, type VoteChoice, type EarnReason } from '@/domain/estate';
import { reviewCollectionInvoice } from '@/domain/estate/collection-review';

const PATHS = ['/community', '/collections', '/tenancy', '/parcels', '/governance', '/events', '/rewards', '/billing', '/people', '/estate', '/dashboard'];
const revalidate = () => PATHS.forEach((p) => revalidatePath(p));

export type Res = { ok: true; ref?: string } | { ok: false; error: string };

type Gate = { ok: true; actor: Actor; scope: ScopeFilter };
async function gate(capability: Capability, action: 'update' | 'create' = 'update'): Promise<Gate | { ok: false; error: string }> {
  const actor = await getActor();
  try { const scope = assertCan(actor, capability, action); return { ok: true, actor, scope }; }
  catch (e) { if (e instanceof ForbiddenError) return { ok: false, error: 'You do not have permission for this.' }; throw e; }
}

/** Resolve mutable rows through the exact tenant/estate predicate used by reads. */
function scoped<T extends ScopableRow & { id: string }>(g: Gate, rows: readonly T[], id: string): T | undefined {
  return rows.find((row) => row.id === id && matchesScope(row, g.scope));
}
function targetEstate(g: Gate, estateId?: string) {
  const sites = db.sites.filter((row) => row.kind === 'estate' && matchesScope({ ...row, siteId: row.id }, g.scope) && (!estateId || row.id === estateId));
  return sites.length === 1 ? sites[0] : undefined;
}
function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value && value >= '1900-01-01' && value <= '2100-12-31';
}
function amountMinor(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  const minor = Math.round(value * 100);
  return Number.isSafeInteger(minor) ? minor : null;
}
function validText(value: unknown, max = 300): value is string {
  return typeof value === 'string' && value.trim().length <= max && !/[\u0000-\u0008\u000b-\u001f\u007f]/.test(value);
}
const sameEstate = (left: ScopableRow, right: ScopableRow) => left.tenantId === right.tenantId && (left.estateId ?? left.siteId) === (right.estateId ?? right.siteId);
function collectionBalance(g: Gate, record: (typeof db.collectionCases)[number]): { minor: number } | { error: string } {
  const review = reviewCollectionInvoice(record, db.invoices.filter((row) => matchesScope(row, g.scope)));
  return review.canFollowUp && review.outstandingMinor !== null ? { minor: review.outstandingMinor } : { error: review.detail };
}

/* --- community ------------------------------------------------------------ */
export async function acknowledgeFeedback(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('announcements'); if (!g.ok) return g;
  const f = scoped(g, db.residentFeedback, id);
  if (!f) return { ok: false, error: 'Feedback not found.' };
  f.acknowledged = true;
  revalidate();
  return { ok: true };

  }, 'estate');
}

export async function resolveComplaint(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('announcements'); if (!g.ok) return g;
  const c = scoped(g, db.complaints, id);
  if (!c) return { ok: false, error: 'Complaint not found.' };
  c.status = 'resolved';
  revalidate();
  return { ok: true };

  }, 'estate');
}

/* --- collections ---------------------------------------------------------- */
export async function sendReminder(caseId: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('charges_invoicing'); if (!g.ok) return g;
  const c = scoped(g, db.collectionCases, caseId);
  if (!c) return { ok: false, error: 'Case not found.' };
  const balance = collectionBalance(g, c); if ('error' in balance) return { ok: false, error: balance.error };
  c.remindersSent += 1; c.lastActionISO = operatingNowISO();
  revalidate();
  return { ok: true, ref: c.invoiceRef };

  }, 'estate');
}

export async function advanceDunning(caseId: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('charges_invoicing'); if (!g.ok) return g;
  const c = scoped(g, db.collectionCases, caseId);
  if (!c) return { ok: false, error: 'Case not found.' };
  const balance = collectionBalance(g, c); if ('error' in balance) return { ok: false, error: balance.error };
  if (c.stage === 'escalated') return { ok: false, error: 'This collection case is already at its final stage.' };
  c.stage = nextDunningStage(c.stage); c.lastActionISO = operatingNowISO();
  revalidate();
  return { ok: true, ref: c.invoiceRef };

  }, 'estate');
}

export async function recordPromise(caseId: string, amountMajor: number, dueISO: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('charges_invoicing'); if (!g.ok) return g;
  const c = scoped(g, db.collectionCases, caseId);
  if (!c) return { ok: false, error: 'Case not found.' };
  const balance = collectionBalance(g, c); if ('error' in balance) return { ok: false, error: balance.error };
  const minor = amountMinor(amountMajor);
  if (minor === null || minor <= 0) return { ok: false, error: 'Enter an amount greater than zero.' };
  if (minor > balance.minor) return { ok: false, error: 'A promise cannot exceed the recorded outstanding invoice balance.' };
  if (!validDate(dueISO)) return { ok: false, error: 'Pick a valid promise date.' };
  c.promiseAmountMinor = minor; c.promiseDueISO = dueISO; c.promiseStatus = 'pending';
  c.stage = 'plan'; c.lastActionISO = operatingNowISO();
  revalidate();
  return { ok: true, ref: c.invoiceRef };

  }, 'estate');
}

/* --- tenancy -------------------------------------------------------------- */
export async function advanceTenancy(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('users_roles'); if (!g.ok) return g;
  const t = scoped(g, db.tenancies, id);
  if (!t) return { ok: false, error: 'Tenancy not found.' };
  if (t.stage === 'closed') return { ok: false, error: 'This tenancy is closed.' };
  t.stage = nextTenancyStage(t.stage);
  if (t.stage === 'active' && !t.moveInISO) t.moveInISO = operatingDateISO();
  if (t.stage === 'moving_in' && t.depositStatus === 'pending') t.depositStatus = 'held';
  revalidate();
  return { ok: true };

  }, 'estate');
}

export async function settleDeposit(id: string, refundMajor: number): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('users_roles'); if (!g.ok) return g;
  const t = scoped(g, db.tenancies, id);
  if (!t) return { ok: false, error: 'Tenancy not found.' };
  if (!['moving_out', 'closed'].includes(t.stage) || !['held', 'pending'].includes(t.depositStatus)) return { ok: false, error: 'Deposit settlement is not available for this tenancy stage or settled deposit.' };
  const refundMinor = amountMinor(refundMajor);
  if (refundMinor === null) return { ok: false, error: 'Enter a finite, non-negative refund amount.' };
  if (refundMinor > t.depositMinor) return { ok: false, error: 'Refund cannot exceed the deposit held.' };
  t.depositStatus = refundMinor === 0 ? 'withheld' : refundMinor >= t.depositMinor ? 'refunded' : 'partially_refunded';
  revalidate();
  return { ok: true };

  }, 'estate');
}

/* --- parcels -------------------------------------------------------------- */
export type LogParcelInput = { estateId?: string; residentName: string; unitLabel: string; courier: string; size: 'S' | 'M' | 'L' };

export async function logParcel(input: LogParcelInput): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('security_sos', 'create'); if (!g.ok) return g;
  if (!input || !validText(input.residentName, 120) || !input.residentName.trim() || !validText(input.unitLabel, 120) || !validText(input.courier, 120) || !['S', 'M', 'L'].includes(input.size)) return { ok: false, error: 'Enter a resident, unit, courier and valid parcel size.' };
  const estate = targetEstate(g, input.estateId);
  if (!estate) return { ok: false, error: 'Choose one of your authorised estates before logging a parcel.' };
  const code = `PKG-${Math.max(7744, ...db.parcels.map((row) => Number(/^PKG-(\d+)$/.exec(row.code)?.[1] ?? 0))) + 1}`;
  // Prefer the smallest compatible free locker in this estate; otherwise use the desk.
  const sizes = ['S', 'M', 'L'];
  const locker = db.lockers.filter((row) => !row.parcelId && row.tenantId === estate.tenantId && row.estateId === estate.id && matchesScope(row, g.scope) && sizes.indexOf(row.size) >= sizes.indexOf(input.size)).sort((a, b) => sizes.indexOf(a.size) - sizes.indexOf(b.size))[0];
  const id = `pc-new-${nextRecordSequence('estate:pcSeq', 0, true)}`;
  db.parcels.unshift({
    tenantId: estate.tenantId, id, estateId: estate.id,
    code, residentName: input.residentName.trim(), unitLabel: input.unitLabel.trim() || '—', courier: input.courier.trim() || 'Courier',
    lockerLabel: locker?.label, size: input.size, status: locker ? 'stored' : 'received', receivedISO: new Date(Date.parse(operatingNowISO())).toISOString(),
  } as (typeof db.parcels)[number]);
  if (locker) locker.parcelId = id;
  revalidate();
  return { ok: true, ref: code };

  }, 'estate');
}

export async function collectParcel(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('security_sos'); if (!g.ok) return g;
  const p = scoped(g, db.parcels, id);
  if (!p) return { ok: false, error: 'Parcel not found.' };
  if (p.status === 'collected') return { ok: false, error: 'Already collected.' };
  p.status = 'collected'; p.collectedISO = new Date(Date.parse(operatingNowISO())).toISOString();
  const locker = db.lockers.find((l) => l.parcelId === id && sameEstate(l, p) && matchesScope(l, g.scope));
  if (locker) locker.parcelId = undefined;
  revalidate();
  return { ok: true, ref: p.code };

  }, 'estate');
}

export async function notifyResident(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('security_sos'); if (!g.ok) return g;
  const p = scoped(g, db.parcels, id);
  if (!p) return { ok: false, error: 'Parcel not found.' };
  revalidate();
  return { ok: true, ref: p.code };

  }, 'estate');
}

/* --- governance & e-voting ------------------------------------------------ */
export async function openMotion(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('announcements'); if (!g.ok) return g;
  const m = scoped(g, db.motions, id);
  if (!m) return { ok: false, error: 'Motion not found.' };
  if (m.status !== 'draft') return { ok: false, error: 'Only a draft can be opened.' };
  m.status = 'open';
  revalidate();
  return { ok: true, ref: m.ref };

  }, 'estate');
}

/** Record a unit's vote (unit-weighted). One click = one unit's weight. */
export async function castVote(motionId: string, choice: VoteChoice): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('announcements'); if (!g.ok) return g;
  const m = scoped(g, db.motions, motionId);
  if (!m) return { ok: false, error: 'Motion not found.' };
  if (m.status !== 'open') return { ok: false, error: 'Voting is not open on this motion.' };
  if (!['for', 'against', 'abstain'].includes(choice)) return { ok: false, error: 'Choose a valid vote.' };
  if (m.forWeight + m.againstWeight + m.abstainWeight >= m.eligibleWeight) return { ok: false, error: 'All eligible voting weight is already recorded.' };
  if (choice === 'for') m.forWeight += 1; else if (choice === 'against') m.againstWeight += 1; else m.abstainWeight += 1;
  revalidate();
  return { ok: true, ref: m.ref };

  }, 'estate');
}

export async function closeMotion(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('announcements'); if (!g.ok) return g;
  const m = scoped(g, db.motions, id);
  if (!m) return { ok: false, error: 'Motion not found.' };
  if (m.status !== 'open') return { ok: false, error: 'Only an open motion can be closed.' };
  m.status = motionOutcome(m);
  announceMotionOutcome(m);
  revalidate();
  revalidatePath('/portal/announcements'); revalidatePath('/announcements');
  return { ok: true, ref: `${m.ref} ${m.status.replace('_', ' ')}` };

  }, 'estate');
}

/** When a motion resolves, tell residents — an estate announcement of the AGM
 *  result lands in their portal automatically. */
function announceMotionOutcome(m: (typeof db.motions)[number]): void {
  const t = motionTally(m);
  const verdict = m.status === 'passed' ? 'has PASSED' : m.status === 'rejected' ? 'was REJECTED' : 'did NOT reach quorum';
  db.announcements.unshift({
    tenantId: m.tenantId, id: `an-agm-${nextRecordSequence('estate:anSeq', 0, true)}`,
    title: `AGM result — ${m.title}`,
    body: `Motion ${m.ref} ${verdict}. Final turnout ${t.turnoutPct}% (quorum ${m.quorumPct}% required) with ${t.approvalPct}% in favour. Thank you to everyone who took part.`,
    estateId: m.estateId, scope: 'estate', audience: 'All residents', sentAt: operatingNowISO(), delivered: 0, read: 0, aiDrafted: false,
  } as (typeof db.announcements)[number]);
}

/* --- events & amenities --------------------------------------------------- */
export async function rsvpEvent(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('bookings_amenities'); if (!g.ok) return g;
  const e = scoped(g, db.communityEvents, id);
  if (!e) return { ok: false, error: 'Event not found.' };
  if (e.cancelled) return { ok: false, error: 'This event was cancelled.' };
  if (Date.parse(e.endISO) < operatingNowMs()) return { ok: false, error: 'This event has ended.' };
  if (isEventFull(e)) return { ok: false, error: 'This event is full.' };
  e.rsvps += 1;
  revalidate();
  return { ok: true };

  }, 'estate');
}

export async function cancelRsvp(id: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('bookings_amenities'); if (!g.ok) return g;
  const e = scoped(g, db.communityEvents, id);
  if (!e) return { ok: false, error: 'Event not found.' };
  if (e.cancelled || Date.parse(e.endISO) < operatingNowMs()) return { ok: false, error: 'Reservations cannot be changed for a cancelled or ended event.' };
  if (e.rsvps > 0) e.rsvps -= 1;
  revalidate();
  return { ok: true };

  }, 'estate');
}

export type CreateEventInput = { estateId?: string; title: string; category: 'social' | 'fitness' | 'kids' | 'meeting' | 'festive'; venue: string; host: string; startISO: string; capacity: number };
export async function createEvent(input: CreateEventInput): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('bookings_amenities', 'create'); if (!g.ok) return g;
  if (!input || !validText(input.title, 160) || !input.title.trim() || !validText(input.venue, 200) || !validText(input.host, 120)) return { ok: false, error: 'Enter valid event details.' };
  if (!['social', 'fitness', 'kids', 'meeting', 'festive'].includes(input.category)) return { ok: false, error: 'Choose a valid event category.' };
  if (!Number.isSafeInteger(input.capacity) || input.capacity <= 0 || input.capacity > 100000) return { ok: false, error: 'Capacity must be a whole number between 1 and 100,000.' };
  if (!validDate(input.startISO)) return { ok: false, error: 'Pick a valid event date.' };
  const estate = targetEstate(g, input.estateId);
  if (!estate) return { ok: false, error: 'Choose one of your authorised estates before creating an event.' };
  const start = new Date(`${input.startISO}T18:00:00Z`).toISOString();
  const end = new Date(Date.parse(start) + 2 * 3600 * 1000).toISOString();
  db.communityEvents.unshift({
    tenantId: estate.tenantId, id: `ev-new-${nextRecordSequence('estate:evSeq', 0, true)}`, estateId: estate.id,
    title: input.title.trim(), category: input.category, venue: input.venue.trim() || 'Clubhouse Hall', host: input.host.trim() || 'Estate Office',
    startISO: start, endISO: end, capacity: Math.round(input.capacity), rsvps: 0,
  } as (typeof db.communityEvents)[number]);
  revalidate();
  return { ok: true, ref: input.title.trim() };

  }, 'estate');
}

/* --- board & committee ---------------------------------------------------- */
export type CreateMotionInput = { estateId?: string; title: string; summary: string; category: 'budget' | 'rule' | 'works' | 'board'; quorumPct: number; thresholdPct: number };
export async function createMotion(input: CreateMotionInput): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('announcements', 'create'); if (!g.ok) return g;
  if (!input || !validText(input.title, 160) || !input.title.trim() || !validText(input.summary, 3000)) return { ok: false, error: 'Enter valid motion details.' };
  if (!['budget', 'rule', 'works', 'board'].includes(input.category) || !Number.isFinite(input.quorumPct) || !Number.isFinite(input.thresholdPct) || input.quorumPct < 1 || input.quorumPct > 100 || input.thresholdPct < 1 || input.thresholdPct > 100) return { ok: false, error: 'Choose a category and percentages between 1 and 100.' };
  const estate = targetEstate(g, input.estateId);
  if (!estate) return { ok: false, error: 'Choose one of your authorised estates before creating a motion.' };
  if (!Number.isSafeInteger(estate.unitCount) || estate.unitCount <= 0) return { ok: false, error: 'Verify the estate unit count before creating a unit-weighted motion.' };
  const moSeq = nextRecordSequence('estate:moSeq', 0, true);
  const seq = db.motions.length + moSeq;
  db.motions.push({
    tenantId: estate.tenantId, id: `mo-new-${moSeq}`, estateId: estate.id,
    ref: `AGM-${String(seq).padStart(2, '0')}`, title: input.title.trim(), summary: input.summary.trim() || 'Motion tabled by the committee.',
    category: input.category, status: 'draft', opensISO: operatingDateISO(), closesISO: operatingDateISO(),
    eligibleWeight: estate.unitCount, forWeight: 0, againstWeight: 0, abstainWeight: 0,
    quorumPct: Math.min(100, Math.max(1, Math.round(input.quorumPct || 33))), thresholdPct: Math.min(100, Math.max(1, Math.round(input.thresholdPct || 50))),
  } as (typeof db.motions)[number]);
  revalidate();
  return { ok: true, ref: `AGM-${String(seq).padStart(2, '0')}` };

  }, 'estate');
}

export async function recordMeetingHeld(id: string, attendees: number): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('announcements'); if (!g.ok) return g;
  const m = scoped(g, db.meetings, id);
  if (!m) return { ok: false, error: 'Meeting not found.' };
  if (m.status !== 'scheduled') return { ok: false, error: 'Only a scheduled meeting can be recorded as held.' };
  if (!Number.isSafeInteger(attendees) || attendees < 0 || attendees > 100000) return { ok: false, error: 'Enter a valid whole-number attendee count.' };
  m.status = 'held'; m.attendees = attendees;
  // A proxy is only good for its meeting — once the meeting is closed, any
  // still-held proxies for that meeting's motions lapse (a real governance rule).
  const motionIds = new Set(db.motions.filter((mo) => mo.egmMeetingId === id && sameEstate(mo, m) && matchesScope(mo, g.scope)).map((mo) => mo.id));
  let lapsed = 0;
  for (const p of db.proxyAssignments) {
    if (motionIds.has(p.motionId) && p.status === 'held' && sameEstate(p, m) && matchesScope(p, g.scope)) { p.status = 'expired'; lapsed += 1; }
  }
  // Closing the meeting concludes voting: each open EGM motion tied to it is
  // resolved on the weights actually recorded (lapsed proxies don't count).
  const outcomes: string[] = [];
  for (const mo of db.motions) {
    if (mo.egmMeetingId === id && mo.status === 'open' && sameEstate(mo, m) && matchesScope(mo, g.scope)) { mo.status = motionOutcome(mo); announceMotionOutcome(mo); m.resolutions += 1; outcomes.push(`${mo.ref} ${mo.status.replace('_', ' ')}`); }
  }
  revalidate();
  ['/board', '/governance', '/portal/community', '/portal/announcements', '/announcements'].forEach((path) => revalidatePath(path));
  const parts = [m.title];
  if (lapsed > 0) parts.push(`${lapsed} proxies lapsed`);
  if (outcomes.length) parts.push(outcomes.join(', '));
  return { ok: true, ref: parts.join(' · ') };

  }, 'estate');
}

/* --- loyalty & rewards ---------------------------------------------------- */
export async function awardPoints(memberId: string, reason: EarnReason): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('announcements'); if (!g.ok) return g;
  const m = scoped(g, db.rewardMembers, memberId);
  if (!m) return { ok: false, error: 'Member not found.' };
  if (!Object.hasOwn(EARN_POINTS, reason) || !Number.isSafeInteger(m.points + EARN_POINTS[reason])) return { ok: false, error: 'Choose a valid points reason.' };
  m.points += EARN_POINTS[reason];
  m.lastEarnedISO = operatingDateISO();
  if (reason === 'on_time_payment') m.onTimeStreak += 1;
  if (reason === 'event') m.eventsAttended += 1;
  if (reason === 'poll') m.pollsVoted += 1;
  revalidate();
  return { ok: true };

  }, 'estate');
}

export async function redeemPerk(memberId: string, perkId: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('announcements'); if (!g.ok) return g;
  const m = scoped(g, db.rewardMembers, memberId);
  const p = scoped(g, db.perks, perkId);
  if (!m || !p || !sameEstate(m, p)) return { ok: false, error: 'Member or perk not found in the same estate.' };
  if (p.stock <= 0) return { ok: false, error: 'That perk is out of stock.' };
  if (m.points < p.cost) return { ok: false, error: `${m.residentName} needs ${p.cost - m.points} more points.` };
  m.points -= p.cost; p.stock -= 1;
  const _tier = tierFor(m.points); void _tier;
  revalidate();
  return { ok: true, ref: p.title };

  }, 'estate');
}

/* --- board election (vacant seat) ----------------------------------------- */
const ELECTION_PATHS = ['/board', '/governance', '/portal/community'];
const revalidateElection = () => ELECTION_PATHS.forEach((p) => revalidatePath(p));

export type NominateInput = { name: string; unitLabel: string; statement: string };

/** Nominate a candidate for the seat (allowed while the election isn't decided). */
export async function nominateCandidate(electionId: string, input: NominateInput): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('announcements', 'create'); if (!g.ok) return g;
  const el = scoped(g, db.boardElections, electionId);
  if (!el) return { ok: false, error: 'Election not found.' };
  if (el.status === 'decided') return { ok: false, error: 'This election is already decided.' };
  if (!input || !validText(input.name, 120) || !input.name.trim() || !validText(input.unitLabel, 120) || !validText(input.statement, 3000)) return { ok: false, error: 'Enter valid candidate details.' };
  if (el.candidates.some((c) => c.residentName.toLowerCase() === input.name.trim().toLowerCase())) return { ok: false, error: 'That resident is already standing.' };
  el.candidates.push({ id: `cand-new-${nextRecordSequence('estate:candSeq', 0, true)}`, residentName: input.name.trim(), unitLabel: input.unitLabel.trim() || '—', statement: input.statement.trim() || 'Standing for the committee.', votes: 0 });
  revalidateElection();
  return { ok: true, ref: input.name.trim() };

  }, 'estate');
}

export async function openElectionVoting(electionId: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('announcements'); if (!g.ok) return g;
  const el = scoped(g, db.boardElections, electionId);
  if (!el) return { ok: false, error: 'Election not found.' };
  if (el.status !== 'nominations') return { ok: false, error: 'Voting can only open from nominations.' };
  if (el.candidates.length < 2) return { ok: false, error: 'Need at least two candidates to open voting.' };
  el.status = 'voting';
  revalidateElection();
  return { ok: true, ref: el.ref };

  }, 'estate');
}

/** Close voting: the plurality winner (if quorate, no tie) takes the seat and
 *  joins the committee roster. */
export async function decideElection(electionId: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('announcements'); if (!g.ok) return g;
  const el = scoped(g, db.boardElections, electionId);
  if (!el) return { ok: false, error: 'Election not found.' };
  if (el.status !== 'voting') return { ok: false, error: 'Only an open election can be decided.' };
  const winner = electionWinner(el);
  if (!winner) return { ok: false, error: 'Cannot decide yet — quorum not met or the vote is tied.' };
  el.status = 'decided'; el.winnerCandidateId = winner.id;
  const termEndDate = new Date(operatingDateISO());
  termEndDate.setUTCFullYear(termEndDate.getUTCFullYear() + 2);
  const termEnd = termEndDate.toISOString().slice(0, 10);
  db.boardMembers.push({
    tenantId: el.tenantId, id: `bd-el-${el.id}`, estateId: el.estateId,
    name: winner.residentName, unitLabel: winner.unitLabel, role: 'Member', portfolio: el.portfolio, sinceISO: operatingDateISO(), termEndISO: termEnd,
  } as (typeof db.boardMembers)[number]);
  revalidateElection();
  return { ok: true, ref: winner.residentName };

  }, 'estate');
}

/* --- proxy voting (EGM) --------------------------------------------------- */
/** The Chair casts the held proxy block onto the motion — each directed proxy
 *  adds its grantor's unit weight, then is marked exercised. */
export async function exerciseProxies(motionId: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('announcements'); if (!g.ok) return g;
  const m = scoped(g, db.motions, motionId);
  if (!m) return { ok: false, error: 'Motion not found.' };
  if (m.status !== 'open') return { ok: false, error: 'Voting is not open on this motion.' };
  const held = db.proxyAssignments.filter((p) => p.motionId === motionId && p.status === 'held' && sameEstate(p, m) && matchesScope(p, g.scope));
  if (held.length === 0) return { ok: false, error: 'No proxies waiting to be exercised.' };
  if (m.forWeight + m.againstWeight + m.abstainWeight + held.length > m.eligibleWeight) return { ok: false, error: 'Proxy votes would exceed the eligible voting weight. Review the register first.' };
  for (const p of held) {
    if (p.direction === 'for') m.forWeight += 1; else if (p.direction === 'against') m.againstWeight += 1; else m.abstainWeight += 1;
    p.status = 'exercised';
  }
  ['/governance', '/board', '/portal/community'].forEach((path) => revalidatePath(path));
  return { ok: true, ref: `${held.length} proxies` };

  }, 'estate');
}

/** Revoke a single proxy in the register — and cascade to anyone who delegated
 *  through that grantor, returning their vote to them. */
export async function revokeProxyLink(proxyId: string): Promise<Res> {
  return withDurableMutation(async () => {
  const g = await gate('announcements'); if (!g.ok) return g;
  const px = scoped(g, db.proxyAssignments, proxyId);
  if (!px) return { ok: false, error: 'Proxy not found.' };
  if (px.status !== 'held') return { ok: false, error: 'Only a held proxy can be revoked.' };
  const m = scoped(g, db.motions, px.motionId);
  if (!m || !sameEstate(m, px)) return { ok: false, error: 'Motion not found.' };
  const proxies = db.proxyAssignments.filter((row) => sameEstate(row, px) && matchesScope(row, g.scope));
  const cascaded = cascadeRevokeUpstream(px.grantorName, proxies, px.motionId);
  px.status = 'revoked';
  recordProxyReturnNotice(px.grantorUserId, m, 'The committee revoked the proxy you had assigned. Your vote is yours again.');
  for (const c of cascaded) { c.status = 'revoked'; recordProxyReturnNotice(c.grantorUserId, m, `${px.grantorName}, who you delegated through, was removed from the chain.`); }
  ['/board', '/governance', '/portal/community'].forEach((path) => revalidatePath(path));
  return { ok: true, ref: `${px.grantorName} withdrawn${cascaded.length ? ` · ${cascaded.length} cascaded` : ''}` };

  }, 'estate');
}

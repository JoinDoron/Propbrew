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
import { nextDunningStage, nextTenancyStage } from '@/domain/estate';

const PATHS = ['/community', '/collections', '/tenancy', '/parcels', '/billing', '/people', '/dashboard'];
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

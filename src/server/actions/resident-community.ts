'use server';

/**
 * Resident-portal community actions — a resident acting on their OWN behalf.
 *
 * RSVP rides a real §7 grant: residents hold bookings_amenities:create.
 *
 * Voting and perk-redemption are resident participation the §7 matrix does not
 * model (the matrix is CR-locked; residents are V on announcements — they
 * receive, they don't author). These are `proposed` features, so they are gated
 * by an explicit resident role check + the record's own rules (one vote per
 * resident; you can only spend your own points), all enforced server-side.
 */

import { revalidatePath } from 'next/cache';
import { getActor } from '@/server/session';
import { ForbiddenError, assertCan } from '@/lib/authz';
import { repos } from '@/server/data';
import { db } from '@/server/data/store';
import { units } from '@/server/data/seed/fixtures';
import { NOW } from '@/domain/ppm';
import { isEventFull, type VoteChoice } from '@/domain/estate';

export type Res = { ok: true; ref?: string } | { ok: false; error: string };

const paths = () => ['/portal/community', '/portal', '/governance', '/events', '/rewards', '/board'].forEach((p) => revalidatePath(p));
function requireResident(actor: Awaited<ReturnType<typeof getActor>>): Res | null {
  return actor.roles.includes('resident') ? null : { ok: false, error: 'This is a resident action.' };
}

export async function residentRsvp(eventId: string): Promise<Res> {
  const actor = await getActor();
  try { assertCan(actor, 'bookings_amenities', 'create'); }
  catch (e) { if (e instanceof ForbiddenError) return { ok: false, error: 'You cannot RSVP.' }; throw e; }
  const e = db.communityEvents.find((x) => x.id === eventId && x.tenantId === actor.tenantId);
  if (!e) return { ok: false, error: 'Event not found.' };
  if (e.cancelled) return { ok: false, error: 'This event was cancelled.' };
  if (isEventFull(e)) return { ok: false, error: 'This event is full.' };
  e.rsvps += 1;
  paths();
  return { ok: true, ref: e.title };
}

export async function residentVote(motionId: string, choice: VoteChoice): Promise<Res> {
  const actor = await getActor();
  const notRes = requireResident(actor); if (notRes) return notRes;
  const m = db.motions.find((x) => x.id === motionId && x.tenantId === actor.tenantId);
  if (!m) return { ok: false, error: 'Motion not found.' };
  if (m.status !== 'open') return { ok: false, error: 'Voting is not open on this motion.' };
  if (db.residentVotes.some((v) => v.motionId === motionId && v.userId === actor.userId)) return { ok: false, error: 'You have already voted on this motion.' };
  // One weight per home: can't vote directly if you've a live proxy out there.
  if (db.proxyAssignments.some((p) => p.motionId === motionId && p.grantorUserId === actor.userId && (p.status === 'held' || p.status === 'exercised'))) return { ok: false, error: 'You’ve assigned a proxy for this motion — revoke it to vote yourself.' };
  db.residentVotes.push({ motionId, userId: actor.userId, choice });
  if (choice === 'for') m.forWeight += 1; else if (choice === 'against') m.againstWeight += 1; else m.abstainWeight += 1;
  paths();
  return { ok: true, ref: m.ref };
}

/** Hand your unit's vote to a holder (e.g. the Chair) with an instruction — for
 *  when you can't attend the EGM. One proxy per home per motion; mutually
 *  exclusive with voting directly. */
export async function residentAssignProxy(motionId: string, holderName: string, direction: VoteChoice): Promise<Res> {
  const actor = await getActor();
  const notRes = requireResident(actor); if (notRes) return notRes;
  const m = db.motions.find((x) => x.id === motionId && x.tenantId === actor.tenantId);
  if (!m) return { ok: false, error: 'Motion not found.' };
  if (m.status !== 'open') return { ok: false, error: 'Voting is not open on this motion.' };
  if (!m.egm) return { ok: false, error: 'Proxies are only for EGM motions.' };
  if (!holderName?.trim()) return { ok: false, error: 'Choose who will carry your proxy.' };
  if (db.residentVotes.some((v) => v.motionId === motionId && v.userId === actor.userId)) return { ok: false, error: 'You’ve already voted directly on this motion.' };
  if (db.proxyAssignments.some((p) => p.motionId === motionId && p.grantorUserId === actor.userId && (p.status === 'held' || p.status === 'exercised'))) return { ok: false, error: 'You’ve already assigned a proxy for this motion.' };
  const me = repos.residents.list(actor).items.find((r) => r.userId === actor.userId);
  db.proxyAssignments.push({
    tenantId: actor.tenantId, id: `px-${actor.userId}-${motionId}`, estateId: (m.estateId as string),
    motionId, grantorName: me?.name ?? 'Resident', grantorUnit: '—', grantorUserId: actor.userId,
    holderName: holderName.trim(), direction, status: 'held',
  } as (typeof db.proxyAssignments)[number]);
  paths();
  return { ok: true, ref: holderName.trim() };
}

export async function residentRevokeProxy(motionId: string): Promise<Res> {
  const actor = await getActor();
  const notRes = requireResident(actor); if (notRes) return notRes;
  const px = db.proxyAssignments.find((p) => p.motionId === motionId && p.grantorUserId === actor.userId && p.status === 'held');
  if (!px) return { ok: false, error: 'No proxy to revoke (it may already be exercised).' };
  px.status = 'revoked';
  paths();
  return { ok: true };
}

/** Cast a resident's single unit-weighted ballot for a candidate in the board
 *  election (proposed resident participation — role-checked, one vote per home). */
export async function residentVoteCandidate(electionId: string, candidateId: string): Promise<Res> {
  const actor = await getActor();
  const notRes = requireResident(actor); if (notRes) return notRes;
  const el = db.boardElections.find((x) => x.id === electionId && x.tenantId === actor.tenantId);
  if (!el) return { ok: false, error: 'Election not found.' };
  if (el.status !== 'voting') return { ok: false, error: 'Voting is not open for this seat.' };
  if (db.electionVotes.some((v) => v.electionId === electionId && v.userId === actor.userId)) return { ok: false, error: 'You have already voted in this election.' };
  const cand = el.candidates.find((c) => c.id === candidateId);
  if (!cand) return { ok: false, error: 'Candidate not found.' };
  db.electionVotes.push({ electionId, userId: actor.userId, candidateId });
  cand.votes += 1;
  paths();
  return { ok: true, ref: cand.residentName };
}

/** Stand for the vacant board seat from the portal — a resident nominates
 *  themselves (name + unit from their record) with a short manifesto. */
export async function residentSelfNominate(electionId: string, statement: string): Promise<Res> {
  const actor = await getActor();
  const notRes = requireResident(actor); if (notRes) return notRes;
  const el = db.boardElections.find((x) => x.id === electionId && x.tenantId === actor.tenantId);
  if (!el) return { ok: false, error: 'Election not found.' };
  if (el.status === 'decided') return { ok: false, error: 'This election is already decided.' };
  const me = repos.residents.list(actor).items.find((r) => r.userId === actor.userId);
  const myName = me?.name ?? 'Resident';
  if (el.candidates.some((c) => c.residentName.toLowerCase() === myName.toLowerCase())) return { ok: false, error: 'You’re already standing for this seat.' };
  const unitLabel = units.find((u) => u.id === me?.unitId)?.label ?? '—';
  el.candidates.push({ id: `cand-self-${actor.userId}`, residentName: myName, unitLabel, statement: statement.trim() || 'Standing for the committee.', votes: 0 });
  paths();
  return { ok: true, ref: myName };
}

/** A resident confirms they've collected their own parcel — frees the locker. */
export async function residentCollectParcel(parcelId: string): Promise<Res> {
  const actor = await getActor();
  const notRes = requireResident(actor); if (notRes) return notRes;
  const myName = repos.residents.list(actor).items.find((r) => r.userId === actor.userId)?.name;
  const p = db.parcels.find((x) => x.id === parcelId && x.tenantId === actor.tenantId);
  if (!p) return { ok: false, error: 'Parcel not found.' };
  if (p.residentName !== myName) return { ok: false, error: 'That parcel isn’t yours.' };
  if (p.status === 'collected') return { ok: false, error: 'Already collected.' };
  p.status = 'collected'; p.collectedISO = new Date(Date.parse(NOW)).toISOString();
  const locker = db.lockers.find((l) => l.parcelId === parcelId);
  if (locker) locker.parcelId = undefined;
  ['/portal/community', '/portal', '/parcels'].forEach((path) => revalidatePath(path));
  return { ok: true, ref: p.code };
}

export async function residentRedeem(perkId: string): Promise<Res> {
  const actor = await getActor();
  const notRes = requireResident(actor); if (notRes) return notRes;
  const myName = repos.residents.list(actor).items.find((r) => r.userId === actor.userId)?.name;
  const me = db.rewardMembers.find((x) => x.residentName === myName);
  const p = db.perks.find((x) => x.id === perkId);
  if (!me) return { ok: false, error: 'No rewards account found.' };
  if (!p) return { ok: false, error: 'Perk not found.' };
  if (p.stock <= 0) return { ok: false, error: 'That perk is out of stock.' };
  if (me.points < p.cost) return { ok: false, error: `You need ${p.cost - me.points} more points.` };
  me.points -= p.cost; p.stock -= 1;
  paths();
  return { ok: true, ref: p.title };
}

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
  db.residentVotes.push({ motionId, userId: actor.userId, choice });
  if (choice === 'for') m.forWeight += 1; else if (choice === 'against') m.againstWeight += 1; else m.abstainWeight += 1;
  paths();
  return { ok: true, ref: m.ref };
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

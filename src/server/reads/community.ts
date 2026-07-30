import 'server-only';

/**
 * Resident-facing community reads. Motions, rewards and perks come through the
 * capability-scoped repos (residents hold `announcements` at V → estate-wide,
 * no ownership filter). Community events are `bookings_amenities`-scoped, which
 * for a resident (O) adds a `self` ownership clause that ownerless events can't
 * satisfy — so we read those directly, filtered to the resident's estate. The
 * per-resident vote ledger is keyed by userId, so it is inherently self-scoped.
 */

import { db } from '@/server/data/store';
import { repos } from '@/server/data';
import { assertCan, type Actor } from '@/lib/authz';
import { applyScope } from '@/lib/authz/scope';

export function residentCommunityData(actor: Actor) {
  // Scope events exactly as motions/rewards are (announcements: residents hold V
  // → ownership:null, estate-scoped) rather than by a hand-rolled estate list —
  // which would break for an all-estates resident whose estateIds is empty.
  const annScope = assertCan(actor, 'announcements', 'read');
  return {
    motions: repos.motions.list(actor).items,
    rewardMembers: repos.rewardMembers.list(actor).items,
    perks: repos.perks.list(actor).items,
    events: applyScope(db.communityEvents, annScope),
    // The resident's own parcels (the page filters by name); estate-scoped read.
    parcels: applyScope(db.parcels, annScope),
    elections: repos.boardElections.list(actor).items,
    proxies: repos.proxyAssignments.list(actor).items,
    myVotes: new Map(db.residentVotes.filter((v) => v.userId === actor.userId).map((v) => [v.motionId, v.choice] as const)),
    myElectionVotes: new Map(db.electionVotes.filter((v) => v.userId === actor.userId).map((v) => [v.electionId, v.candidateId] as const)),
    myProxies: new Map(db.proxyAssignments.filter((p) => p.grantorUserId === actor.userId && p.status !== 'revoked').map((p) => [p.motionId, { holderName: p.holderName, direction: p.direction, status: p.status }] as const)),
  };
}

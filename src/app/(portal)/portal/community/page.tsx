import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { residentCommunityData } from '@/server/reads/community';
import { leaderboard } from '@/domain/estate';
import { CommunityHub, type PMotion, type PEvent, type PPerk, type MyRewards, type PElection, type PParcel } from '@/components/portal/community-hub';
import { isParcelOverdue, type VoteChoice } from '@/domain/estate';

/** Resident community hub — vote on AGM motions, RSVP to events, and see/spend
 *  loyalty points, all from the resident's own shell. Reads ride announcements:V
 *  (estate-wide, no ownership filter); the mutations are resident-scoped
 *  (see server/actions/resident-community.ts). */
export default async function ResidentCommunityPage() {
  const { actor } = await requireCapability('announcements');
  const { motions, events, parcels, rewardMembers, perks, myVotes, elections, myElectionVotes, myProxies } = residentCommunityData(actor);
  const myName = repos.residents.list(actor).items.find((r) => r.userId === actor.userId)?.name;

  const board = leaderboard(rewardMembers);
  const myIdx = board.findIndex((m) => m.residentName === myName);
  const mine = myIdx >= 0 ? board[myIdx] : undefined;

  const motionRows: PMotion[] = motions.map((m) => ({
    id: m.id, ref: m.ref, title: m.title, summary: m.summary, status: m.status,
    forWeight: m.forWeight, againstWeight: m.againstWeight, abstainWeight: m.abstainWeight, eligibleWeight: m.eligibleWeight,
    quorumPct: m.quorumPct, thresholdPct: m.thresholdPct, closesISO: m.closesISO, myChoice: myVotes.get(m.id) as VoteChoice | undefined,
    egm: m.egm, myProxy: myProxies.get(m.id),
  }));
  const eventRows: PEvent[] = events
    .filter((e) => !e.cancelled && Date.parse(e.endISO) >= NOW_MS)
    .sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO))
    .map((e) => ({ id: e.id, title: e.title, category: e.category, venue: e.venue, startISO: e.startISO, capacity: e.capacity, rsvps: e.rsvps }));
  const perkRows: PPerk[] = perks.map((p) => ({ id: p.id, title: p.title, detail: p.detail, cost: p.cost, stock: p.stock }));
  const rewards: MyRewards = mine ? { points: mine.points, onTimeStreak: mine.onTimeStreak, eventsAttended: mine.eventsAttended, pollsVoted: mine.pollsVoted, rank: myIdx + 1, total: board.length } : null;

  const openEl = elections.find((e) => e.status === 'voting');
  const election: PElection = openEl ? {
    id: openEl.id, ref: openEl.ref, seatTitle: openEl.seatTitle, portfolio: openEl.portfolio,
    closesISO: openEl.closesISO, eligibleWeight: openEl.eligibleWeight, quorumPct: openEl.quorumPct,
    candidates: openEl.candidates.map((c) => ({ id: c.id, residentName: c.residentName, unitLabel: c.unitLabel, statement: c.statement, votes: c.votes })),
    myCandidateId: myElectionVotes.get(openEl.id),
  } : null;

  const myParcels: PParcel[] = parcels
    .filter((p) => p.residentName === myName && p.status !== 'collected')
    .sort((a, b) => (isParcelOverdue(b, NOW_MS) ? 1 : 0) - (isParcelOverdue(a, NOW_MS) ? 1 : 0) || Date.parse(a.receivedISO) - Date.parse(b.receivedISO))
    .map((p) => ({ id: p.id, code: p.code, courier: p.courier, size: p.size, status: p.status, lockerLabel: p.lockerLabel, receivedISO: p.receivedISO, overdue: isParcelOverdue(p, NOW_MS) }));

  return (
    <div className="max-w-[640px] mx-auto">
      <CommunityHub firstName={(myName ?? 'there').split(' ')[0]} motions={motionRows} events={eventRows} rewards={rewards} perks={perkRows} election={election} parcels={myParcels} />
    </div>
  );
}

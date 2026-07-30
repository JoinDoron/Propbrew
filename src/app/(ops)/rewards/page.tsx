import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { tierFor, pointsIssued } from '@/domain/estate';
import { RewardsWorkspace, type MemberRow, type PerkRow } from '@/components/estate/rewards-workspace';

/** Rewards — a resident loyalty engine: points for on-time payments, event
 *  attendance and voting; tiers, a leaderboard, and a redeemable-perks catalog.
 *  Gated by announcements (a community-engagement programme). */
export default async function RewardsPage() {
  const { actor } = await requireCapability('announcements');
  const members = repos.rewardMembers.list(actor).items;
  const perks = repos.perks.list(actor).items;

  const memberRows: MemberRow[] = members.map((m) => ({ id: m.id, residentName: m.residentName, unitLabel: m.unitLabel, points: m.points, onTimeStreak: m.onTimeStreak, eventsAttended: m.eventsAttended, pollsVoted: m.pollsVoted }));
  const perkRows: PerkRow[] = perks.map((p) => ({ id: p.id, title: p.title, detail: p.detail, cost: p.cost, category: p.category, stock: p.stock }));

  return (
    <div className="max-w-[1000px] mx-auto">
      <RewardsWorkspace
        members={memberRows}
        perks={perkRows}
        kpis={{
          members: members.length,
          pointsIssued: pointsIssued(members),
          goldPlus: members.filter((m) => tierFor(m.points) === 'gold' || tierFor(m.points) === 'platinum').length,
          perks: perks.length,
        }}
      />
    </div>
  );
}

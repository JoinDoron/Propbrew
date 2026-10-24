import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';
import { tierFor, pointsIssued } from '@/domain/estate';
import { RewardsWorkspace, type MemberRow, type PerkRow } from '@/components/estate/rewards-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** Rewards — a resident loyalty engine: points for on-time payments, event
 *  attendance and voting; tiers, a leaderboard, and a redeemable-perks catalog.
 *  Gated by announcements (a community-engagement programme). */
export default async function RewardsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('announcements', 'read', 'estate');
  const members = repos.rewardMembers.list(actor).items;
  const perks = repos.perks.list(actor).items;

  const memberRows: MemberRow[] = members.map((m) => ({ id: m.id, residentName: m.residentName, unitLabel: m.unitLabel, points: m.points, onTimeStreak: m.onTimeStreak, eventsAttended: m.eventsAttended, pollsVoted: m.pollsVoted }));
  const perkRows: PerkRow[] = perks.map((p) => ({ id: p.id, title: p.title, detail: p.detail, cost: p.cost, category: p.category, stock: p.stock }));

  return (
    <div className="pb-page">
      <PageHeader title="Rewards" subtitle="Recognise participation and review reward activity." />
      <RewardsWorkspace
        members={memberRows}
        perks={perkRows}
        canMutate={can(actor, 'announcements', 'update').allowed}
        kpis={{
          members: members.length,
          pointsIssued: pointsIssued(members),
          goldPlus: members.filter((m) => tierFor(m.points) === 'gold' || tierFor(m.points) === 'platinum').length,
          perks: perks.length,
        }}
      />
    </div>
  );
  });
}

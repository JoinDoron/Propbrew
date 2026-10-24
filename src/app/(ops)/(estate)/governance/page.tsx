import { operatingClock } from '@/server/operating-clock';
import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';

import { GovernanceWorkspace, type MotionRow } from '@/components/estate/governance-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** Governance & e-voting — AGM motions with unit-weighted resident voting, live
 *  quorum and approval-threshold meters, and pass/fail resolution on close.
 *  Gated by announcements (the estate manager runs the AGM). */
export default async function GovernancePage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('announcements', 'read', 'estate');
  const clock = operatingClock();
  const motions = repos.motions.list(actor).items;

  const rows: MotionRow[] = motions.map((m) => ({
    id: m.id, ref: m.ref, title: m.title, summary: m.summary, category: m.category, status: m.status,
    opensISO: m.opensISO, closesISO: m.closesISO, eligibleWeight: m.eligibleWeight,
    forWeight: m.forWeight, againstWeight: m.againstWeight, abstainWeight: m.abstainWeight,
    quorumPct: m.quorumPct, thresholdPct: m.thresholdPct,
  }));

  return (
    <div className="pb-page">
      <PageHeader title="Governance" subtitle="Motions, quorum and transparent estate decisions." />
      <GovernanceWorkspace motions={rows} nowMs={clock.nowMs} canMutate={can(actor, 'announcements', 'update').allowed} />
    </div>
  );
  });
}

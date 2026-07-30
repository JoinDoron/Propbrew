import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { GovernanceWorkspace, type MotionRow } from '@/components/estate/governance-workspace';

/** Governance & e-voting — AGM motions with unit-weighted resident voting, live
 *  quorum and approval-threshold meters, and pass/fail resolution on close.
 *  Gated by announcements (the estate manager runs the AGM). */
export default async function GovernancePage() {
  const { actor } = await requireCapability('announcements');
  const motions = repos.motions.list(actor).items;

  const rows: MotionRow[] = motions.map((m) => ({
    id: m.id, ref: m.ref, title: m.title, summary: m.summary, category: m.category, status: m.status,
    opensISO: m.opensISO, closesISO: m.closesISO, eligibleWeight: m.eligibleWeight,
    forWeight: m.forWeight, againstWeight: m.againstWeight, abstainWeight: m.abstainWeight,
    quorumPct: m.quorumPct, thresholdPct: m.thresholdPct,
  }));

  return (
    <div className="max-w-[980px] mx-auto">
      <GovernanceWorkspace motions={rows} nowMs={NOW_MS} />
    </div>
  );
}

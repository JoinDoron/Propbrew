import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { PageHeader } from '@/components/ui/page-header';
import { ScopeBanner } from '@/components/domain';
import { InvestorWorkspace } from '@/components/investors/investor-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** SC-08 / AI-S-04 — investor projects, ops/exec view (portfolio-wide). A sales
 *  desk: per-project forecast (pace → sell-out date), ROI and revenue
 *  projections, a lead→reserved→sold funnel, an inventory heatmap, milestone
 *  timeline and scored leads. Every projection is a deterministic estimate with
 *  its assumptions on show — never financial advice. Scoped (§7 O: investors see
 *  only their own projects). */
export default async function InvestorsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('investor_projects', 'read', 'estate');
  const projects = [...repos.investorProjects.list(actor).items];

  return (
    <div className="pb-page">
      <PageHeader title="Investor Projects" subtitle="Sales pace, sell-out & ROI forecasts, pipeline funnel and inventory — estimates, assumptions shown"
        scope={<ScopeBanner label={actor.allEstates ? 'all projects' : `${actor.estateIds.length} estate(s)`} />}
      />
      <InvestorWorkspace projects={projects} />
    </div>
  );
  });
}

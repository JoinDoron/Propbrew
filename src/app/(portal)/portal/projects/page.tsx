import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { InvestorPortfolioWorkspace } from '@/components/portal/investor-portfolio-workspace';

/** SC-08 / AI-S-04 (investor view, §7 O) — My Projects, a personal off-plan
 *  portfolio: your holding (units, invested, projected value), construction
 *  progress + handover countdown, sell-out forecast, and a milestone-linked
 *  payment plan. Every projection is a labelled estimate — not financial advice.
 *  Scoped to the investor's own projects (my_projects). */
export default async function MyProjectsPage() {
  const { actor } = await requireCapability('investor_projects');
  const projects = [...repos.investorProjects.list(actor).items];

  return (
    <div className="pb-page">
      <PageHeader title="My investments" subtitle="Your project holdings, progress and payment plans." />
      <div className="w-full min-w-0 flex flex-col gap-6">
      <InvestorPortfolioWorkspace projects={projects} />
      </div>
    </div>
  );
}

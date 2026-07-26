import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { ScopeBanner } from '@/components/domain';
import { InvestorProjectsView } from '@/components/domain/investor-projects';

/** SC-08 — investor projects, ops/exec view (portfolio-wide). */
export default async function InvestorsPage() {
  const { actor } = await requireCapability('investor_projects');
  const projects = repos.investorProjects.list(actor).items;
  return (
    <div className="max-w-[1100px] mx-auto flex flex-col gap-3.5">
      <ScopeBanner label={actor.allEstates ? 'all projects' : `${actor.estateIds.length} estate(s)`} />
      <InvestorProjectsView projects={projects} />
    </div>
  );
}

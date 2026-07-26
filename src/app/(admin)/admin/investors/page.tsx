import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { InvestorProjectsView } from '@/components/domain/investor-projects';

/** SC-08 — investor projects, platform-wide (Platform Admin, cross-tenant). */
export default async function AdminInvestorsPage() {
  const { actor } = await requireCapability('investor_projects');
  const projects = repos.investorProjects.list(actor).items;
  return (
    <div className="max-w-[1100px] mx-auto">
      <InvestorProjectsView projects={projects} />
    </div>
  );
}

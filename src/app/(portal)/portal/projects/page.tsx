import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { InvestorProjectsView } from '@/components/domain/investor-projects';

/** SC-08 — the investor's own projects only (§7 O). */
export default async function MyProjectsPage() {
  const { actor } = await requireCapability('investor_projects');
  const projects = repos.investorProjects.list(actor).items;
  return (
    <div className="max-w-[1000px] mx-auto">
      <InvestorProjectsView projects={projects} showTotals={false} />
    </div>
  );
}

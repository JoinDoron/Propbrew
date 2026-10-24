import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { InvestorProjectsView } from '@/components/domain/investor-projects';
import { PageTabs } from '@/components/ui/page-tabs';
import { withDurableRead } from '@/server/data/durable-records';

/** SC-08 — investor projects, platform-wide (Platform Admin, cross-tenant). */
export default async function AdminInvestorsPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('investor_projects');
  const projects = repos.investorProjects.list(actor).items;
  return (
    <div className="pb-page">
      <PageHeader title="Investor projects" subtitle="A platform-wide view of investor projects." />
      <PageTabs label="Platform investor sections" items={[
        { id: 'projects', label: 'Investor projects', content: <div className="flex flex-col gap-6 min-w-0"><InvestorProjectsView projects={projects} /></div> }
      ]} />
    </div>
  );
  });
}

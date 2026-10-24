import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { InvestorUpdatesWorkspace } from '@/components/portal/investor-updates-workspace';

/** SC-08 (investor view, §7 O) — Updates. Per-project construction progress, a
 *  milestone update feed, the handover countdown, and downloadable documents
 *  (allocation letter, SPA, receipts, construction report). Scoped to the
 *  investor's own projects. */
export default async function InvestorUpdatesPage() {
  const { actor } = await requireCapability('investor_projects');
  const projects = [...repos.investorProjects.list(actor).items];

  return (
    <div className="pb-page">
      <PageHeader title="Project updates" subtitle="Construction milestones and documents for your investments." />
      <div className="w-full min-w-0 flex flex-col gap-6">
      <InvestorUpdatesWorkspace projects={projects} />
      </div>
    </div>
  );
}

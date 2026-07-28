import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { InvestorReturnsWorkspace } from '@/components/portal/investor-returns-workspace';

/** SC-08 / AI-S-04 (investor view, §7 O) — Returns projector. An interactive
 *  model: pick a project or the whole portfolio, set the hold period,
 *  appreciation and rental yield, and see projected capital growth + rental
 *  income + total return. All estimates on the inputs — not financial advice.
 *  Scoped to the investor's own projects. */
export default async function InvestorReturnsPage() {
  const { actor } = await requireCapability('investor_projects');
  const projects = [...repos.investorProjects.list(actor).items];

  return (
    <div className="max-w-[640px] mx-auto">
      <InvestorReturnsWorkspace projects={projects} />
    </div>
  );
}

import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { BoqWorkspace, type BoqProject } from '@/components/construction/boq-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** BOQ import — paste a bill of quantities, validate it line by line, reconcile
 *  the total against the approved budget, preview exactly what will be written,
 *  then commit to cost codes. Invalid lines are excluded and reported. */
export default async function ConstructionBoqPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const canMutate = can(actor, 'reports_analytics', 'create').allowed;
  const world = constructionWorld(actor);

  const projects: BoqProject[] = world.projects.map((p) => ({
    id: p.id, name: p.name, code: p.code,
    approvedBudgetMinor: p.approvedBudget.minor,
    existingCodes: world.costCodes.filter((c) => c.projectId === p.id).map((c) => c.code),
  }));

  return (
    <div className="pb-page">
      <BoqWorkspace projects={projects} canMutate={canMutate} />
    </div>
  );
  });
}

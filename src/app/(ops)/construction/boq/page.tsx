import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { BoqWorkspace, type BoqProject } from '@/components/construction/boq-workspace';

/** BOQ import — paste a bill of quantities, validate it line by line, reconcile
 *  the total against the approved budget, preview exactly what will be written,
 *  then commit to cost codes. Invalid lines are excluded and reported. */
export default async function ConstructionBoqPage() {
  const { actor } = await requireCapability('reports_analytics');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'reports_analytics'));
  const world = constructionWorld(actor);

  const projects: BoqProject[] = world.projects.map((p) => ({
    id: p.id, name: p.name, code: p.code,
    approvedBudgetMinor: p.approvedBudget.minor,
    existingCodes: world.costCodes.filter((c) => c.projectId === p.id).map((c) => c.code),
  }));

  return (
    <div className="max-w-[1000px] mx-auto">
      <BoqWorkspace projects={projects} canMutate={canMutate} />
    </div>
  );
}

import { requireCapability } from '@/server/guard';
import { constructionWorld } from '@/server/reads/construction';
import { criticalPath, taskDurationDays, projectEVMOf, forecastFinishISO } from '@/domain/construction';
import { SimulatorWorkspace } from '@/components/construction/simulator-workspace';
import { PageTabs } from '@/components/ui/page-tabs';
import { PageHeader } from '@/components/ui/page-header';
import { withDurableRead } from '@/server/data/durable-records';

/** What-If Simulator — drive the shared CPM + earned-value engines with live
 *  assumptions (productivity, diesel shock, rain days, days to claw back). The
 *  recovery optimiser crashes only zero-float tasks, cheapest-first, and shows
 *  the bill. Everything is a calculation; nothing is saved. */
export default async function ConstructionSimulatorPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const world = constructionWorld(actor);

  // Simulate the project with the deepest task network.
  const counts = new Map<string, number>();
  for (const t of world.tasks) counts.set(t.projectId, (counts.get(t.projectId) ?? 0) + 1);
  const projectId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? world.projects[0]?.id ?? '';
  const project = world.projects.find((p) => p.id === projectId);
  if (!project) return <div className="pb-page"><PageHeader title="Scenario simulator" subtitle="Explore assumptions before making a deliberate re-plan." /><PageTabs label="Construction scenario sections" items={[{ id: 'assumptions', label: 'Assumptions', content: <p className="text-[13px] text-text-3">No project to simulate.</p> }]} /></div>;

  const tasks = world.tasks.filter((t) => t.projectId === projectId);
  const cpm = criticalPath(tasks.map((t) => ({ id: t.id, durationDays: taskDurationDays(t), dependsOn: t.dependsOn })));
  const evm = projectEVMOf(project, world.costCodes);
  const ff = forecastFinishISO(project, evm.spi);

  // Fuel-exposed spend: what a diesel price shock would actually hit.
  const diesel = world.materials.find((m) => m.category === 'Fuel');
  const dieselExposureMinor = diesel
    ? world.movements.filter((m) => m.materialId === diesel.id).reduce((n, m) => n + m.qty, 0) * diesel.unitCost.minor + Math.round(evm.etc * 0.08)
    : Math.round(evm.etc * 0.08);

  return (
    <div className="pb-page">
      <SimulatorWorkspace
        project={{ id: project.id, name: project.name, code: project.code, plannedFinishISO: project.plannedFinishISO, startISO: project.startISO, approvedBudget: { minor: project.approvedBudget.minor, currency: 'NGN' }, plannedPercent: project.plannedPercent, percentComplete: project.percentComplete }}
        evm={evm}
        tasks={[...tasks]}
        criticalIds={[...cpm.critical]}
        baselineFinishISO={ff.iso}
        baselineSlipDays={ff.slipDays}
        dieselExposureMinor={dieselExposureMinor}
      />
    </div>
  );
  });
}

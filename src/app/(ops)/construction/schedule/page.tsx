import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { NOW_MS } from '@/domain/ppm';
import {
  criticalPath, taskDurationDays, slipPropagation, projectEVMOf, forecastFinishISO, milestoneBand,
} from '@/domain/construction';
import { ScheduleWorkspace, type GanttTask, type MilestoneRow } from '@/components/construction/schedule-workspace';

/** Critical Path & Schedule — a real CPM forward/backward pass over the task DAG:
 *  earliest/latest times, total float, the zero-float critical chain, and a
 *  hover cascade showing exactly what slips when a task slips. */
export default async function ConstructionSchedulePage() {
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const canMutate = can(actor, 'reports_analytics', 'update').allowed;
  const canCreate = can(actor, 'reports_analytics', 'create').allowed;
  const world = constructionWorld(actor);

  // The flagship build: the project with the most scheduled work.
  const counts = new Map<string, number>();
  for (const t of world.tasks) counts.set(t.projectId, (counts.get(t.projectId) ?? 0) + 1);
  const projectId = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? world.projects[0]?.id ?? '';
  const project = world.projects.find((p) => p.id === projectId);
  const tasks = world.tasks.filter((t) => t.projectId === projectId);
  const phases = world.phases;

  const cpm = criticalPath(tasks.map((t) => ({ id: t.id, durationDays: taskDurationDays(t), dependsOn: t.dependsOn })));
  const phaseName = (id: string) => phases.find((p) => p.id === id)?.name ?? 'Works';

  const rows: GanttTask[] = tasks
    .map((t) => ({
      id: t.id, name: t.name, owner: t.owner, phase: phaseName(t.phaseId),
      plannedStartISO: t.plannedStartISO, plannedFinishISO: t.plannedFinishISO, actualStartISO: t.actualStartISO,
      percentComplete: t.percentComplete, status: t.status,
      critical: cpm.critical.has(t.id), slackDays: cpm.slack.get(t.id) ?? 0,
      offsetDays: cpm.es.get(t.id) ?? 0, durationDays: taskDurationDays(t),
      downstream: slipPropagation(tasks, t.id, 1).taskIds,
    }))
    .sort((a, b) => a.offsetDays - b.offsetDays || a.name.localeCompare(b.name));

  const milestones: MilestoneRow[] = world.milestones
    .filter((m) => m.projectId === projectId)
    .map((m) => ({ id: m.id, name: m.name, dueISO: m.dueISO, status: m.status, band: milestoneBand(m, NOW_MS) }))
    .sort((a, b) => Date.parse(a.dueISO) - Date.parse(b.dueISO));

  const evm = project ? projectEVMOf(project, world.costCodes) : null;
  const ff = project && evm ? forecastFinishISO(project, evm.spi) : { iso: '—', slipDays: 0 };

  return (
    <div className="pb-page">
      <ScheduleWorkspace
        projectName={project?.name ?? 'Project'}
        tasks={rows}
        milestones={milestones}
        kpis={{
          durationDays: cpm.durationDays,
          criticalCount: cpm.critical.size,
          blocked: tasks.filter((t) => t.status === 'blocked').length,
          forecastFinishISO: ff.iso,
          slipDays: ff.slipDays,
          plannedFinishISO: project?.plannedFinishISO ?? '—',
        }}
        canMutate={canMutate}
        canCreate={canCreate}
      />
    </div>
  );
}

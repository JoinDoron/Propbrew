import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { operatingClock } from '@/server/operating-clock';
import {
  programmeNetwork, programmeLookAhead, slipPropagation, projectEVMOf, forecastFinishISO, milestoneBand,
} from '@/domain/construction';
import { ScheduleWorkspace, type GanttTask, type MilestoneRow } from '@/components/construction/schedule-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** Critical Path & Schedule — a real CPM forward/backward pass over the task DAG:
 *  earliest/latest times, total float, the zero-float critical chain, and a
 *  hover cascade showing exactly what slips when a task slips. */
export default async function ConstructionSchedulePage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  return withDurableRead(async () => {
  const { nowMs: NOW_MS, dateISO: TODAY } = operatingClock();
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const canMutate = can(actor, 'reports_analytics', 'update').allowed;
  const canCreate = can(actor, 'reports_analytics', 'create').allowed;
  const world = constructionWorld(actor);
  const requestedProjectId = (await searchParams).projectId;

  // The flagship build: the project with the most scheduled work.
  const counts = new Map<string, number>();
  for (const t of world.tasks) counts.set(t.projectId, (counts.get(t.projectId) ?? 0) + 1);
  const projectId = requestedProjectId && world.projects.some((row) => row.id === requestedProjectId)
    ? requestedProjectId
    : [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? world.projects[0]?.id ?? '';
  const project = world.projects.find((p) => p.id === projectId);
  const tasks = world.tasks.filter((t) => t.projectId === projectId);
  const phases = world.phases;

  const calendar = project?.mobilisation?.calendar ?? { workingDays: [1, 2, 3, 4, 5, 6], holidays: [] };
  const cpm = programmeNetwork(tasks, calendar, TODAY);
  const phaseName = (id: string) => phases.find((p) => p.id === id)?.name ?? 'Works';

  const rows: GanttTask[] = tasks
    .map((t) => ({
      id: t.id, name: t.name, owner: t.owner, phase: phaseName(t.phaseId),
      plannedStartISO: t.plannedStartISO, plannedFinishISO: t.plannedFinishISO, actualStartISO: t.actualStartISO,
      percentComplete: t.percentComplete, status: t.status,
      forecastStartISO: cpm.startISO.get(t.id), forecastFinishISO: cpm.finishISO.get(t.id),
      delayDays: t.programmeDelay?.workingDays ?? 0, delayReasonCodeId: t.programmeDelay?.reasonCodeId,
      critical: cpm.critical.has(t.id), slackDays: cpm.slack.get(t.id) ?? 0,
      offsetDays: cpm.es.get(t.id) ?? 0, durationDays: (cpm.ef.get(t.id) ?? 0) - (cpm.es.get(t.id) ?? 0),
      downstream: slipPropagation(tasks, t.id, 1).taskIds,
    }))
    .sort((a, b) => a.offsetDays - b.offsetDays || a.name.localeCompare(b.name));

  const milestones: MilestoneRow[] = world.milestones
    .filter((m) => m.projectId === projectId)
    .map((m) => ({ id: m.id, name: m.name, dueISO: m.dueISO, status: m.status, band: milestoneBand(m, NOW_MS) }))
    .sort((a, b) => Date.parse(a.dueISO) - Date.parse(b.dueISO));

  const evm = project ? projectEVMOf(project, world.costCodes) : null;
  const evmForecast = project && evm ? forecastFinishISO(project, evm.spi) : { iso: '—', slipDays: 0 };
  const finishISO = [cpm.projectFinishISO, evmForecast.iso].filter((iso): iso is string => !!iso && Number.isFinite(Date.parse(iso))).sort().at(-1) ?? '—';
  const ff = { iso: finishISO, slipDays: project && Number.isFinite(Date.parse(finishISO)) ? Math.round((Date.parse(finishISO) - Date.parse(project.plannedFinishISO)) / 86400000) : 0 };

  return (
    <div className="pb-page">
      <ScheduleWorkspace
        projectName={project?.name ?? 'Project'}
        tasks={rows}
        milestones={milestones}
        lookAhead={([2, 4, 6] as const).map((weeks) => ({ weeks, rows: programmeLookAhead(tasks, cpm, TODAY, weeks).map((row) => ({ ...row, name: tasks.find((task) => task.id === row.id)?.name ?? row.id, owner: tasks.find((task) => task.id === row.id)?.owner ?? 'Unassigned' })) }))}
        delayReasons={world.reasonCodes.filter((code) => code.domain === 'delay' && code.active).map((code) => ({ id: code.id, label: code.label, requiresNote: code.requiresNote }))}
        kpis={{
          durationDays: cpm.durationDays,
          criticalCount: cpm.critical.size,
          blocked: tasks.filter((t) => t.status === 'blocked').length,
          forecastFinishISO: ff.iso,
          networkFinishISO: cpm.projectFinishISO ?? '—',
          slipDays: ff.slipDays,
          plannedFinishISO: project?.plannedFinishISO ?? '—',
          approvedChangeDays: project?.approvedChangeDays ?? 0,
          changeDaysInBaseline: project?.approvedChangeDaysInBaseline ?? 0,
        }}
        canMutate={canMutate}
        canCreate={canCreate}
      />
    </div>
  );
  });
}

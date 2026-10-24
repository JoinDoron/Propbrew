import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { NOW } from '@/domain/ppm';
import { FieldCapture, type FieldProject, type FieldTask, type FieldWorker } from '@/components/construction/field-capture';
import { withDurableRead } from '@/server/data/durable-records';

/** Field Capture — the offline-first site app (PRD §7 "Mobile and offline",
 *  §17 acceptance: "no entered record or attachment is lost during
 *  synchronization"). Daily reports, issues, attendance and task progress are
 *  written to a durable device outbox FIRST and drain themselves when signal
 *  returns; every op carries an idempotency key so a retry can't double-apply. */
export default async function ConstructionFieldPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const world = constructionWorld(actor);

  const active = world.projects.filter((p) => p.status === 'active' || p.status === 'closing');
  const projects: FieldProject[] = (active.length ? active : world.projects).map((p) => ({ id: p.id, name: p.name, code: p.code }));
  const projectIds = new Set(projects.map((p) => p.id));

  const tasks: FieldTask[] = world.tasks
    .filter((t) => projectIds.has(t.projectId) && t.status !== 'done')
    .map((t) => ({ id: t.id, projectId: t.projectId, name: t.name, percentComplete: t.percentComplete }));

  const workers: FieldWorker[] = world.workers
    .filter((w) => !w.projectId || projectIds.has(w.projectId))
    .map((w) => ({ id: w.id, projectId: w.projectId, name: w.name, trade: w.trade }));

  return (
    <div className="pb-page">
      <FieldCapture owner={actor.tenantId ? JSON.stringify([actor.tenantId, actor.userId]) : undefined} projects={projects} tasks={tasks} workers={workers} todayISO={NOW.slice(0, 10)} canCapture={can(actor, 'reports_analytics', 'create').allowed} />
    </div>
  );
  });
}

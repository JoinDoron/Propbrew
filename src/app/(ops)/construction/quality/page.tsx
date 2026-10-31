import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { withDurableRead } from '@/server/data/durable-records';
import { operatingDateISO } from '@/server/operating-clock';
import { QualityWorkspace } from '@/components/construction/quality-workspace';

export const dynamic = 'force-dynamic';

export default async function ConstructionQualityPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  return withDurableRead(async () => {
    const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
    const world = constructionWorld(actor);
    const { projectId } = await searchParams;
    const projects = world.projects.map((project) => ({ id: project.id, name: project.name, code: project.code }));
    const selectedProjectId = projects.some((project) => project.id === projectId) ? projectId! : projects[0]?.id ?? '';
    const issues = world.issues.filter((issue) => issue.projectId === selectedProjectId && ['Punch list', 'Authority inspection', 'Design clash'].includes(issue.category));
    const taskNames = world.tasks.filter((task) => task.projectId === selectedProjectId).map((task) => task.name);
    return <div className="pb-page"><QualityWorkspace projects={projects} projectId={selectedProjectId} issues={issues} taskNames={taskNames} today={operatingDateISO()} canCreate={can(actor, 'reports_analytics', 'create').allowed} canUpdate={can(actor, 'reports_analytics', 'update').allowed} /></div>;
  });
}

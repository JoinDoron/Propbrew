import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { repos } from '@/server/data';
import { withDurableRead } from '@/server/data/durable-records';
import { operatingDateISO } from '@/server/operating-clock';
import { QualityWorkspace } from '@/components/construction/quality-workspace';
import { canRecordQualitySignOff, qualityIssueVisible } from '@/server/construction/quality-access';

export const dynamic = 'force-dynamic';

export default async function ConstructionQualityPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  return withDurableRead(async () => {
    const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
    const { projectId } = await searchParams;
    const scopedProjects = repos.constructionProjects.list(actor, { limit: Number.MAX_SAFE_INTEGER }).items;
    const projects = scopedProjects.map((project) => ({ id: project.id, name: project.name, code: project.code }));
    const selectedProjectId = projects.some((project) => project.id === projectId) ? projectId! : projects[0]?.id ?? '';
    const issues = repos.constructionIssues.list(actor, { limit: Number.MAX_SAFE_INTEGER }).items.filter((issue) => issue.projectId === selectedProjectId && ['Punch list', 'Authority inspection', 'Design clash'].includes(issue.category) && qualityIssueVisible(actor, issue));
    const taskNames = repos.constructionTasks.list(actor, { limit: Number.MAX_SAFE_INTEGER }).items.filter((task) => task.projectId === selectedProjectId).map((task) => task.name);
    const packages = scopedProjects.find((project) => project.id === selectedProjectId)?.mobilisation?.workPackages.filter((pack) => !actor.constructionPackageIds || actor.constructionPackageIds.includes(pack.id) || Boolean(pack.costCode && actor.constructionPackageIds.includes(`${selectedProjectId}:${pack.costCode}`))).map((pack) => ({ id: pack.id, name: pack.name })) ?? [];
    return <div className="pb-page"><QualityWorkspace projects={projects} projectId={selectedProjectId} issues={issues} taskNames={taskNames} today={operatingDateISO()} canCreate={can(actor, 'reports_analytics', 'create').allowed} canUpdate={can(actor, 'reports_analytics', 'update').allowed} canSignOff={canRecordQualitySignOff(actor) && (can(actor, 'reports_analytics', 'update').allowed || can(actor, 'reports_analytics', 'approve').allowed)} companyId={actor.tenantId ?? ''} packages={packages} /></div>;
  });
}

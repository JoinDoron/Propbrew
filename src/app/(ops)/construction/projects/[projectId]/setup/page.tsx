import { notFound } from 'next/navigation';
import { can } from '@/lib/authz';
import { ProjectSetupWorkspace } from '@/components/construction/project-setup-workspace';
import { repos } from '@/server/data';
import { withDurableRead } from '@/server/data/durable-records';
import { requireCapability } from '@/server/guard';
import { isConstructionProjectSetupSection } from '@/config/construction-project-setup';

export const dynamic = 'force-dynamic';

export default async function ConstructionProjectSetupPage({ params, searchParams }: { params: Promise<{ projectId: string }>; searchParams: Promise<{ section?: string | string[] }> }) {
  return withDurableRead(async () => {
    const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
    const { projectId } = await params;
    const requestedSection = (await searchParams).section;
    const section = typeof requestedSection === 'string' && isConstructionProjectSetupSection(requestedSection) ? requestedSection : 'programme';
    const project = repos.constructionProjects.list(actor, { limit: 500 }).items.find((row) => row.id === projectId);
    if (!project) notFound();
    const [phases, tasks, milestones, costCodes] = [
      repos.constructionPhases.list(actor, { limit: 500 }).items.filter((row) => row.projectId === projectId),
      repos.constructionTasks.list(actor, { limit: 1000 }).items.filter((row) => row.projectId === projectId),
      repos.constructionMilestones.list(actor, { limit: 500 }).items.filter((row) => row.projectId === projectId),
      repos.constructionCostCodes.list(actor, { limit: 500 }).items.filter((row) => row.projectId === projectId),
    ];
    return <div className="pb-page"><ProjectSetupWorkspace key={`${project.id}:${section}`} project={project} phases={phases} tasks={tasks} milestones={milestones} costCodes={costCodes} canMutate={can(actor, 'reports_analytics', 'update').allowed} initialSection={section} /></div>;
  });
}

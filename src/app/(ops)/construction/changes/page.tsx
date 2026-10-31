import { ChangeOrdersWorkspace } from '@/components/construction/change-orders-workspace';
import { can } from '@/lib/authz';
import { constructionControl } from '@/server/construction-control';
import { repos } from '@/server/data';
import { withDurableRead } from '@/server/data/durable-records';
import { db } from '@/server/data/store';
import { rfiInScope, rfiPackageAllowed } from '@/server/construction/rfi-access';
import { requireCapability } from '@/server/guard';

export const dynamic = 'force-dynamic';

export default async function ConstructionChangesPage({ searchParams }: { searchParams: Promise<{ projectId?: string }> }) {
  return withDurableRead(async () => {
    const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
    const { projectId } = await searchParams;
    const projects = repos.constructionProjects.list(actor, { limit: Number.MAX_SAFE_INTEGER }).items;
    const selected = projects.find((row) => row.id === projectId) ?? projects[0];
    const project = selected && { id: selected.id, name: selected.name, code: selected.code, approvedBudgetMinor: selected.approvedBudget.minor,
      contractMinor: selected.contractValue.minor, approvedChangeDays: selected.approvedChangeDays ?? 0 };
    const costCodes = selected ? repos.constructionCostCodes.list(actor, { limit: Number.MAX_SAFE_INTEGER }).items.filter((row) => row.projectId === selected.id)
      .filter((row) => !actor.constructionPackageIds || selected.mobilisation?.workPackages.some((pack) => pack.costCode === row.code && rfiPackageAllowed(actor, selected, pack.id)))
      .map((row) => ({ code: row.code, name: row.name, budgetMinor: row.budget.minor, committedMinor: row.committed.minor,
        workPackageId: selected.mobilisation?.workPackages.find((pack) => pack.costCode === row.code)?.id })) : [];
    const rfis = selected ? repos.constructionRfis.list(actor, { limit: Number.MAX_SAFE_INTEGER }).items.filter((row) => row.projectId === selected.id && row.status !== 'draft' && rfiInScope(actor, row))
      .map((row) => ({ id: row.id, label: `${row.ref} · ${row.title ?? row.question.slice(0, 80)}`, workPackageId: row.workPackageId })) : [];
    const issues = selected ? repos.constructionIssues.list(actor, { limit: Number.MAX_SAFE_INTEGER }).items.filter((row) => row.projectId === selected.id && rfiPackageAllowed(actor, selected, row.workPackageId))
      .map((row) => ({ id: row.id, label: `${row.category} · ${row.title}`, workPackageId: row.workPackageId })) : [];
    const state = constructionControl(actor.tenantId!);
    const contractors = selected ? [
      ...state.subcontractors.filter((row) => row.tenantId === actor.tenantId && row.projectIds.includes(selected.id) && row.status === 'approved').map((row) => ({ id: row.id, name: row.name })),
      ...db.constructionSubcontractors.filter((row) => row.tenantId === actor.tenantId && row.projectIds.includes(selected.id)).map((row) => ({ id: row.id, name: row.name })),
    ].filter((row) => actor.companyAccess?.operationalProfileId !== 'subcontractor' || actor.constructionSubcontractorIds?.includes(row.id)) : [];
    const orders = selected ? repos.constructionVariations.list(actor, { limit: Number.MAX_SAFE_INTEGER }).items
      .filter((row) => row.projectId === selected.id && (!row.changeOrder || rfiPackageAllowed(actor, selected, row.changeOrder.workPackageId)))
      .map((row) => ({ ...row, costImpact: row.costImpact.minor })) : [];
    const access = actor.companyAccess; const privileged = !access || access.companyRole === 'owner' || access.companyRole === 'admin' || !access.operationalProfileId;
    const allowed = (...profiles: string[]) => privileged || profiles.includes(access?.operationalProfileId ?? '');
    return <div className="pb-page"><ChangeOrdersWorkspace
      projects={projects.map((row) => ({ id: row.id, name: row.name, code: row.code }))} project={project}
      costCodes={costCodes} rfis={rfis} issues={issues} contractors={contractors} orders={orders}
      canPropose={can(actor, 'reports_analytics', 'create').allowed}
      canRequest={can(actor, 'reports_analytics', 'update').allowed && allowed('project-director', 'project-manager', 'quantity-surveyor')}
      canQuote={can(actor, 'reports_analytics', 'update').allowed && (allowed('project-director', 'project-manager', 'quantity-surveyor') || access?.operationalProfileId === 'subcontractor')}
      canAssess={can(actor, 'reports_analytics', 'approve').allowed && allowed('quantity-surveyor', 'project-director')}
      canDecide={can(actor, 'reports_analytics', 'approve').allowed && allowed('project-director', 'project-manager', 'consultant-approver')}
      canPost={can(actor, 'reports_analytics', 'approve').allowed && allowed('construction-finance', 'project-director')}
      actorId={actor.userId}
    /></div>;
  });
}

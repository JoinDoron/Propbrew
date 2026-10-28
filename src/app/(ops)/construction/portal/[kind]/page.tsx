import { notFound } from 'next/navigation';
import { ConstructionRolePortal, type ConstructionPortalKind } from '@/components/construction/role-portal';
import { repos } from '@/server/data';
import { withDurableRead } from '@/server/data/durable-records';
import { currentRecordContext } from '@/server/data/record-context';
import { requireCapability } from '@/server/guard';

const PROFILE: Record<ConstructionPortalKind, string> = { client: 'client-investor', consultant: 'consultant-approver', subcontractor: 'subcontractor', field: 'construction-field-worker' };
const KINDS = new Set<ConstructionPortalKind>(['client', 'consultant', 'subcontractor', 'field']);

export default async function ConstructionPortalPage({ params }: { params: Promise<{ kind: string }> }) {
  return withDurableRead(async () => {
    const kindValue = (await params).kind;
    if (!KINDS.has(kindValue as ConstructionPortalKind)) notFound();
    const kind = kindValue as ConstructionPortalKind;
    const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
    const profile = actor.companyAccess?.operationalProfileId;
    const administrator = actor.companyAccess?.companyRole === 'owner' || actor.companyAccess?.companyRole === 'admin';
    const isolatedDemo = Boolean(currentRecordContext()?.companyPrincipal?.sandbox);
    if (!isolatedDemo && !administrator && profile !== PROFILE[kind]) notFound();
    return <div className="pb-page"><ConstructionRolePortal kind={kind} projectCount={repos.constructionProjects.list(actor, { limit: 500 }).total} /></div>;
  });
}

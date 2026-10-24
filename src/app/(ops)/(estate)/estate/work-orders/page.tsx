import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { getSession, devIdentityEnabled } from '@/server/session';
import { isReviewActor } from '@/server/review-auth';
import { listEstateWorkOrderSites, listEstateWorkOrderUnits, listEstateWorkOrders } from '@/server/reads/estate-work-orders';
import { PageHeader } from '@/components/ui/page-header';
import { PageTabs } from '@/components/ui/page-tabs';
import { ScopeBanner } from '@/components/domain';
import { WorkOrdersBoard } from '@/components/work-orders/work-orders-board';
import { WorkOrdersIntel } from '@/components/work-orders/work-orders-intel';
import { EstateWorkOrderCreate } from '@/components/work-orders/estate-work-order-create';
import { NOW_MS } from '@/domain/ppm';
import { CLOSED } from '@/domain/work-orders';

const BASE_PATH = '/estate/work-orders';

/** Estate owns the complete register, request intake and follow-up journey. */
export default async function EstateWorkOrdersPage() {
  const { actor } = await requireCapability('work_orders', 'read', 'estate');
  const session = await getSession();
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'work_orders'));
  const rows = listEstateWorkOrders(actor);
  const open = rows.filter((workOrder) => !CLOSED.includes(workOrder.status)).length;
  const sites = canMutate ? listEstateWorkOrderSites(actor).map((site) => ({ id: String(site.id), label: site.name })) : [];
  const units = canMutate ? listEstateWorkOrderUnits(actor).map((unit) => ({ id: String(unit.id), siteId: String(unit.siteId), label: unit.label })) : [];
  const memory = !process.env.DATA_SOURCE || process.env.DATA_SOURCE === 'memory';
  const privateReview = session?.key === 'private-review' && isReviewActor(actor);
  const demo = memory && (privateReview || process.env.NODE_ENV !== 'production' && devIdentityEnabled() && session?.key !== 'clerk');
  const boardRows = rows.map((workOrder) => ({
    id: workOrder.id, ref: workOrder.ref, title: workOrder.title, origin: workOrder.origin,
    requesterName: workOrder.requesterName, status: workOrder.status, priority: workOrder.priority,
    assigneeName: workOrder.assigneeName, respondDueAt: workOrder.respondDueAt,
    breached: !CLOSED.includes(workOrder.status) && workOrder.respondDueAt !== null && Date.parse(workOrder.respondDueAt) < NOW_MS,
    cost: workOrder.cost,
  }));

  return <div className="pb-page">
    <PageHeader title="Estate work orders" subtitle={`${open} open · ${rows.length} total · manage requests, assignments and resolution without leaving Estate`}
      scope={<ScopeBanner label="Authorised estate properties only" />} />
    <PageTabs label="Estate work order sections" defaultTab="register" items={[
      { id: 'register', label: 'Work order register', count: rows.length, content: <WorkOrdersBoard rows={boardRows} canMutate={canMutate} basePath={BASE_PATH} createAction={<EstateWorkOrderCreate sites={sites} units={units} demo={demo} />} /> },
      { id: 'intelligence', label: 'SLA & AI intelligence', content: <WorkOrdersIntel wos={rows} nowMs={NOW_MS} canMutate={canMutate} basePath={BASE_PATH} /> },
    ]} />
  </div>;
}

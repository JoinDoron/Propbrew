import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { PageHeader } from '@/components/ui/page-header';
import { PageTabs } from '@/components/ui/page-tabs';
import { ScopeBanner } from '@/components/domain';
import { WorkOrdersBoard } from '@/components/work-orders/work-orders-board';
import { WorkOrdersIntel } from '@/components/work-orders/work-orders-intel';
import { operatingClock } from '@/server/operating-clock';
import { withDurableRead } from '@/server/data/durable-records';
import { FacilityWorkOrderCreate } from '@/components/work-orders/facility-work-order-create';
import { currentRecordContext } from '@/server/data/record-context';
import { nativeAuthEnabled } from '@/server/auth/mode';

const CLOSED = ['closed', 'cancelled', 'rejected', 'verified'];

/** FM-03 — work-order register. The status tabs filter the list, and a List/Board
 *  toggle shows the §10 pipeline as a kanban. Managers (M) get a New button;
 *  view-only roles (Executive, V) get a Read-only chip. */
export default async function WorkOrdersPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('work_orders', 'read', 'facility');
  const clock = operatingClock();
  const boardNowMs = clock.native ? clock.nowMs : Date.parse('2026-07-26T09:00:00Z');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'work_orders'));
  const registrationReady = nativeAuthEnabled() && Boolean(actor.companyAccess) && currentRecordContext()?.domainTenantId === actor.tenantId;
  const locations = registrationReady && canMutate ? repos.sites.list(actor, { limit: 200 }).items.map((site) => ({ id: String(site.id), label: site.name })) : [];
  const assets = registrationReady && canMutate ? repos.assets.list(actor, { limit: 500 }).items.filter((asset) => asset.status !== 'archived').map((asset) => ({ id: String(asset.id), siteId: String(asset.siteId), label: asset.name })) : [];
  const rows = repos.workOrders.list(actor).items;
  const wos = [...rows];
  const open = rows.filter((w) => !CLOSED.includes(w.status)).length;

  const boardRows = rows.map((w) => ({
    id: w.id,
    ref: w.ref,
    title: w.title,
    origin: w.origin,
    requesterName: w.requesterName,
    status: w.status,
    priority: w.priority,
    assigneeName: w.assigneeName,
    respondDueAt: w.respondDueAt,
    breached: !CLOSED.includes(w.status) && w.respondDueAt !== null && Date.parse(w.respondDueAt) < boardNowMs,
    cost: w.cost,
  }));

  return (
    <div className="pb-page">
      <PageHeader title={`${open} open · ${rows.length} total`} subtitle="SLA snapshot and rules-based advisory triage — every job from request to close"
        scope={<ScopeBanner label={actor.allEstates ? 'all estates' : `${actor.estateIds.length} estate(s)`} />}
      />
      <PageTabs label="Work order sections" defaultTab="register" items={[
        { id: 'register', label: 'Work order register', count: rows.length, content: <WorkOrdersBoard rows={boardRows} canMutate={canMutate} createAction={registrationReady && canMutate ? <FacilityWorkOrderCreate locations={locations} assets={assets} /> : undefined} /> },
        { id: 'intelligence', label: 'SLA & AI intelligence', content: <WorkOrdersIntel wos={wos} nowMs={clock.nowMs} canMutate={canMutate} /> },
      ]} />
    </div>
  );
  });
}

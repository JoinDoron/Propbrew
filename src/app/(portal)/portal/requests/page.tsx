import { PageHeader } from '@/components/ui/page-header';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { can } from '@/lib/authz';
import { RequestsWorkspace, type RequestRow } from '@/components/portal/requests-workspace';

/** EM-03 (resident view) — My Requests. A resident may raise a request (create)
 *  and rate on resolution, but not drive the §10 machine. Each request shows a
 *  friendly Submitted → Resolved tracker; raising one runs deterministic triage
 *  (category · priority · ETA) and creates a real work order (§7 O). */
export default async function MyRequestsPage() {
  const { actor } = await requireCapability('work_orders');
  const requests: RequestRow[] = repos.workOrders.list(actor).items.map((w) => ({
    id: w.id, ref: w.ref, title: w.title, status: w.status, priority: w.priority, assigneeName: w.assigneeName, createdAt: w.createdAt,
  }));

  return (
    <div className="pb-page">
      <PageHeader title="My requests" subtitle="Raise an issue and follow it through to resolution." />
      <div className="w-full min-w-0 flex flex-col gap-6">
      <RequestsWorkspace requests={requests} canCreate={can(actor, 'work_orders', 'create').allowed} />
      </div>
    </div>
  );
}

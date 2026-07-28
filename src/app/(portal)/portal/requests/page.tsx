import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
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
    <div className="max-w-[720px] mx-auto">
      <RequestsWorkspace requests={requests} />
    </div>
  );
}

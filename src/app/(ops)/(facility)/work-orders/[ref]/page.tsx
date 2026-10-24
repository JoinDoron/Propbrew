import { notFound } from 'next/navigation';
import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { WorkOrderDetailView } from '@/components/work-orders/work-order-detail-view';
import { withDurableRead } from '@/server/data/durable-records';

export default async function WorkOrderDetail({ params }: { params: Promise<{ ref: string }> }) {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('work_orders', 'read', 'facility');
  const { ref } = await params;
  const wo = repos.workOrders.getByRef(actor, ref);
  if (!wo) notFound();
  return <WorkOrderDetailView actor={actor} wo={wo} basePath="/work-orders" />;
  });
}

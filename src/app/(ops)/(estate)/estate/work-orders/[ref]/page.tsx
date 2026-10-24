import { notFound } from 'next/navigation';
import { requireCapability } from '@/server/guard';
import { getEstateWorkOrder } from '@/server/reads/estate-work-orders';
import { WorkOrderDetailView } from '@/components/work-orders/work-order-detail-view';
import { withDurableRead } from '@/server/data/durable-records';

export default async function EstateWorkOrderDetail({ params }: { params: Promise<{ ref: string }> }) {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('work_orders', 'read', 'estate');
  const { ref } = await params;
  const wo = getEstateWorkOrder(actor, ref);
  if (!wo) notFound();
  return <WorkOrderDetailView actor={actor} wo={wo} basePath="/estate/work-orders" />;
  });
}

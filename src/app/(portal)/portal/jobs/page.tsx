import { requireCapability } from '@/server/guard';
import { ComingSoon } from '@/components/coming-soon';

export default async function Page() {
  await requireCapability('work_orders');
  return <ComingSoon requirementIds={['FM-05','FM-03']} />;
}

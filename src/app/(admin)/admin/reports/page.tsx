import { requireCapability } from '@/server/guard';
import { ComingSoon } from '@/components/coming-soon';

export default async function Page() {
  await requireCapability('reports_analytics');
  return <ComingSoon requirementIds={['FM-07']} />;
}

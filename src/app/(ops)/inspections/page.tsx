import { requireCapability } from '@/server/guard';
import { ComingSoon } from '@/components/coming-soon';

export default async function Page() {
  await requireCapability('inspections_compliance');
  return <ComingSoon requirementIds={['FM-06']} />;
}

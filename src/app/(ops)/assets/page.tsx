import { requireCapability } from '@/server/guard';
import { ComingSoon } from '@/components/coming-soon';

export default async function Page() {
  await requireCapability('assets_ppm');
  return <ComingSoon requirementIds={['FM-01']} />;
}

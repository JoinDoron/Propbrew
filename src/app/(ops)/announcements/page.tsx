import { requireCapability } from '@/server/guard';
import { ComingSoon } from '@/components/coming-soon';

export default async function Page() {
  await requireCapability('announcements');
  return <ComingSoon requirementIds={['EM-04']} />;
}

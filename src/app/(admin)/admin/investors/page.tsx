import { requireCapability } from '@/server/guard';
import { ComingSoon } from '@/components/coming-soon';

export default async function Page() {
  await requireCapability('investor_projects');
  return <ComingSoon requirementIds={['SC-08']} />;
}

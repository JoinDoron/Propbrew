import { requireCapability } from '@/server/guard';
import { ComingSoon } from '@/components/coming-soon';

export default async function Page() {
  await requireCapability('users_roles');
  return <ComingSoon requirementIds={['SC-01']} />;
}

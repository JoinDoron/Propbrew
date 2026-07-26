import { requireCapability } from '@/server/guard';
import { ComingSoon } from '@/components/coming-soon';

export default async function Page() {
  await requireCapability('tenant_config');
  return <ComingSoon requirementIds={['AI-S-06']} />;
}

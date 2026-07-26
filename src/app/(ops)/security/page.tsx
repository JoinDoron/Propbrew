import { requireCapability } from '@/server/guard';
import { ComingSoon } from '@/components/coming-soon';

export default async function Page() {
  await requireCapability('security_sos');
  return <ComingSoon requirementIds={['EM-06']} />;
}

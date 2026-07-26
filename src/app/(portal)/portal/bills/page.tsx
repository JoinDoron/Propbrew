import { requireCapability } from '@/server/guard';
import { ComingSoon } from '@/components/coming-soon';

export default async function Page() {
  await requireCapability('charges_invoicing');
  return <ComingSoon requirementIds={['EM-01']} />;
}

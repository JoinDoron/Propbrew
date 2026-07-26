import { requireCapability } from '@/server/guard';
import { ComingSoon } from '@/components/coming-soon';

export default async function Page() {
  await requireCapability('bookings_amenities');
  return <ComingSoon requirementIds={['EM-05']} />;
}

import { ShortletCopilotWorkspace } from '@/components/shortlet/copilot-workspace';
import { requireCapability } from '@/server/guard';
import { NOW } from '@/domain/ppm';
import { SHORTLET_QUESTIONS } from '@/domain/shortlet/copilot';
import { withDurableRead } from '@/server/data/durable-records';

export default async function ShortletCopilotPage() {
  return withDurableRead(async () => {
  await requireCapability('bookings_amenities', 'read', 'shortlet');
  return <div className="pb-page"><ShortletCopilotWorkspace snapshotISO={NOW} suggestions={SHORTLET_QUESTIONS} /></div>;
  });
}

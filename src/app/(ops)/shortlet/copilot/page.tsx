import { ShortletCopilotWorkspace } from '@/components/shortlet/copilot-workspace';
import { requireCapability } from '@/server/guard';
import { NOW } from '@/domain/ppm';
import { SHORTLET_QUESTIONS } from '@/domain/shortlet/copilot';

export default async function ShortletCopilotPage() {
  await requireCapability('bookings_amenities', 'read', 'shortlet');
  return <div className="pb-page"><ShortletCopilotWorkspace snapshotISO={NOW} suggestions={SHORTLET_QUESTIONS} /></div>;
}

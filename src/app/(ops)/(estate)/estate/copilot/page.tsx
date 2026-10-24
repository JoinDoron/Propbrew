import { requireCapability } from '@/server/guard';
import { AskData } from '@/components/reports/ask-data';
import { withDurableRead } from '@/server/data/durable-records';

/** Estate-local entry point; every answer independently checks its source capability. */
export default async function EstateCopilotPage() {
  return withDurableRead(async () => {
  await requireCapability('reports_analytics', 'read', 'estate');
  return <div className="pb-page"><AskData standalone /></div>;
  });
}

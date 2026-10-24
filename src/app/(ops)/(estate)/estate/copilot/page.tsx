import { requireCapability } from '@/server/guard';
import { AskData } from '@/components/reports/ask-data';

/** Estate-local entry point; every answer independently checks its source capability. */
export default async function EstateCopilotPage() {
  await requireCapability('reports_analytics', 'read', 'estate');
  return <div className="pb-page"><AskData standalone /></div>;
}

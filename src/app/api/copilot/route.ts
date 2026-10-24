import { handleCopilot } from '@/server/ai/copilot';
import { buildFacilityContext } from '@/server/ai/context/facility';
import { withDurableRead } from '@/server/data/durable-records';

export async function POST(request: Request) {
  return withDurableRead(async () => {
  return handleCopilot(request, 'facility', buildFacilityContext);
  });
}

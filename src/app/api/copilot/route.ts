import { handleCopilot } from '@/server/ai/copilot';
import { buildFacilityContext } from '@/server/ai/context/facility';

export async function POST(request: Request) {
  return handleCopilot(request, 'facility', buildFacilityContext);
}

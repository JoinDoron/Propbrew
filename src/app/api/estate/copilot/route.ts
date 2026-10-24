import { handleCopilot } from '@/server/ai/copilot';
import { buildEstateContext } from '@/server/ai/context/estate';

export async function POST(request: Request) {
  return handleCopilot(request, 'estate', buildEstateContext);
}

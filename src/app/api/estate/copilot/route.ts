import { handleCopilot } from '@/server/ai/copilot';
import { buildEstateContext } from '@/server/ai/context/estate';
import { withDurableRead } from '@/server/data/durable-records';

export async function POST(request: Request) {
  return withDurableRead(async () => {
  return handleCopilot(request, 'estate', buildEstateContext);
  });
}

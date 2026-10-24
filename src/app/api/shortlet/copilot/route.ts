import { handleCopilot } from '@/server/ai/copilot';
import { buildShortletCopilotContext } from '@/server/ai/context/shortlet';
import { withDurableRead } from '@/server/data/durable-records';

/** Authenticated, read-only AI through the shared guarded streaming protocol. */
export async function POST(request: Request) {
  return withDurableRead(async () => {
  return handleCopilot(request, 'shortlet', buildShortletCopilotContext);
  });
}

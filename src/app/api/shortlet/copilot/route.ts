import { handleCopilot } from '@/server/ai/copilot';
import { buildShortletCopilotContext } from '@/server/ai/context/shortlet';

/** Authenticated, read-only AI through the shared guarded streaming protocol. */
export async function POST(request: Request) {
  return handleCopilot(request, 'shortlet', buildShortletCopilotContext);
}

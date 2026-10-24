import { handleCopilot } from '@/server/ai/copilot';
import { buildConstructionCopilotContext } from '@/server/ai/context/construction';

/** Authenticated, read-only AI through the shared guarded streaming protocol. */
export async function POST(request: Request) {
  return handleCopilot(request, 'construction', buildConstructionCopilotContext);
}

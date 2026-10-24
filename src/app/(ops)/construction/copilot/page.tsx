import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { operatingClock } from '@/server/operating-clock';
import { suggestedQuestions } from '@/domain/construction';
import { CopilotWorkspace } from '@/components/construction/copilot-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** Construction Copilot — permission-aware Q&A grounded in the project records.
 *  The deterministic engine computes the answer and is the ONLY context an LLM
 *  may write from, so it cannot invent state; every factual answer cites records.
 *  View-only stakeholders get commercial figures withheld. */
export default async function ConstructionCopilotPage() {
  return withDurableRead(async () => {
  const { nowMs: NOW_MS } = operatingClock();
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const canSeeCommercials = ['F', 'M'].includes(effectiveLevel(actor, 'reports_analytics'));
  const world = constructionWorld(actor);

  return (
    <div className="pb-page">
      <CopilotWorkspace suggestions={suggestedQuestions(world, NOW_MS)} canSeeCommercials={canSeeCommercials} />
    </div>
  );
  });
}

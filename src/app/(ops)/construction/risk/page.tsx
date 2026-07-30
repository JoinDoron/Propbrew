import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { constructionWorld, signalStates } from '@/server/reads/construction';
import { NOW_MS } from '@/domain/ppm';
import { scanRisks } from '@/domain/construction';
import { RiskRadar, type RadarSignal } from '@/components/construction/risk-radar';

/** AI Risk Radar — nine deterministic detectors (schedule slip, cost overrun,
 *  late procurement, low stock, material leakage, missing reports, overdue RFIs,
 *  cert expiry, critical issues) each emitting evidence, confidence and ₦-at-risk.
 *  Advisory only: acknowledge, snooze, dismiss, or escalate into a real Issue. */
export default async function ConstructionRiskPage() {
  const { actor } = await requireCapability('reports_analytics');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'reports_analytics'));

  const world = constructionWorld(actor);

  const states = signalStates();
  const signals: RadarSignal[] = scanRisks(world, NOW_MS).map((s) => ({
    id: s.id, kind: s.kind, projectId: s.projectId, projectName: s.projectName, severity: s.severity,
    confidence: s.confidence, title: s.title, evidence: s.evidence, recommendation: s.recommendation,
    nairaAtRiskMinor: s.nairaAtRiskMinor, href: s.href, state: states.get(s.id),
  }));

  return (
    <div className="max-w-[1000px] mx-auto">
      <RiskRadar signals={signals} canMutate={canMutate} />
    </div>
  );
}

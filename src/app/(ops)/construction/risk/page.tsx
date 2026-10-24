import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { constructionWorld, signalStates, signalEscalations } from '@/server/reads/construction';
import { NOW_MS } from '@/domain/ppm';
import { scanRisks } from '@/domain/construction';
import { RiskRadar, type RadarSignal } from '@/components/construction/risk-radar';

/** AI Risk Radar — nine deterministic detectors (schedule slip, cost overrun,
 *  late procurement, low stock, material leakage, missing reports, overdue RFIs,
 *  cert expiry, critical issues) each emitting evidence, confidence and ₦-at-risk.
 *  Advisory only: acknowledge, snooze, dismiss, or escalate into a real Issue. */
export default async function ConstructionRiskPage() {
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const canMutate = can(actor, 'reports_analytics', 'update').allowed;
  const canCreate = can(actor, 'reports_analytics', 'create').allowed;

  const world = constructionWorld(actor);

  const states = signalStates(actor);
  const escalations = signalEscalations(actor);
  const signals: RadarSignal[] = scanRisks(world, NOW_MS).map((s) => ({
    id: s.id, kind: s.kind, projectId: s.projectId, projectName: s.projectName, severity: s.severity,
    confidence: s.confidence, title: s.title, evidence: s.evidence, recommendation: s.recommendation,
    nairaAtRiskMinor: s.nairaAtRiskMinor, href: s.href, state: states.get(s.id), escalatedIssueId: escalations.get(s.id),
  }));

  return (
    <div className="pb-page">
      <RiskRadar signals={signals} canMutate={canMutate} canCreate={canCreate} />
    </div>
  );
}

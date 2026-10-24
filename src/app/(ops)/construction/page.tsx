import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { constructionWorld, signalStates } from '@/server/reads/construction';
import { NOW, NOW_MS } from '@/domain/ppm';
import {
  scanRisks, portfolioConfidence, projectEVMOf, forecastFinishISO, moneySCurve,
  deliveryRadar, attendanceSummary,
} from '@/domain/construction';
import { CommandCenter, type ProjectRow, type SignalRow, type DeliveryRow } from '@/components/construction/command-center';
import { withDurableRead } from '@/server/data/durable-records';

const OPEN_PO = ['issued', 'acknowledged', 'part_delivered', 'approved'];

/** Construction Command Center — the portfolio cockpit: a live delivery-confidence
 *  index, a ₦-at-risk-ranked attention feed from the deterministic risk radar,
 *  per-project earned-value sparklines, and today's delivery radar. */
export default async function ConstructionPage() {
  return withDurableRead(async () => {
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const canMutate = can(actor, 'reports_analytics', 'update').allowed;

  const world = constructionWorld(actor);

  const signals = scanRisks(world, NOW_MS);
  const states = signalStates(actor);
  const signalRows: SignalRow[] = signals.map((s) => ({
    id: s.id, kind: s.kind, projectName: s.projectName, severity: s.severity, confidence: s.confidence,
    title: s.title, evidence: s.evidence, recommendation: s.recommendation, nairaAtRiskMinor: s.nairaAtRiskMinor,
    href: s.href, state: states.get(s.id),
  }));

  const today = NOW.slice(0, 10);
  const active = world.projects.filter((p) => p.status === 'active' || p.status === 'closing');
  const projectRows: ProjectRow[] = world.projects.map((p) => {
    const evm = projectEVMOf(p, world.costCodes);
    const ff = forecastFinishISO(p, evm.spi);
    const att = attendanceSummary(world.attendance, world.workers, p.id, today);
    return {
      id: p.id, name: p.name, code: p.code, status: p.status,
      percentComplete: p.percentComplete, plannedPercent: p.plannedPercent,
      cpi: evm.cpi, spi: evm.spi, costBand: evm.costBand, scheduleBand: evm.scheduleBand,
      eacMinor: evm.eac, bacMinor: evm.bac,
      curve: moneySCurve(evm, p.percentComplete / 100, 10).map((c) => ({ pv: c.pv, ev: c.ev })),
      onSite: att.present, planned: att.planned,
      forecastFinishISO: ff.iso, slipDays: ff.slipDays,
    };
  });

  const radar = deliveryRadar(world.pos, NOW_MS);
  const toRow = (p: (typeof world.pos)[number], late: boolean): DeliveryRow => ({ ref: p.ref, item: p.item, vendorName: p.vendorName, expectedISO: p.expectedISO, qty: p.qty, deliveredQty: p.deliveredQty, unit: p.unit, late });

  const onSite = world.attendance.filter((a) => a.dateISO === today && a.status === 'present').length;

  return (
    <div className="pb-page">
      <CommandCenter
        confidence={portfolioConfidence(world.projects, world.costCodes, signals)}
        projects={projectRows}
        signals={signalRows}
        deliveries={{ late: radar.late.map((p) => toRow(p, true)), today: radar.today.map((p) => toRow(p, false)), upcoming: radar.upcoming.map((p) => toRow(p, false)) }}
        kpis={{
          activeProjects: active.length,
          onSite,
          plannedCrew: world.workers.length,
          openPoValueMinor: world.pos.filter((p) => OPEN_PO.includes(p.status)).reduce((n, p) => n + p.value.minor, 0),
          criticalSignals: signals.filter((s) => s.severity === 'danger' && states.get(s.id) !== 'dismissed').length,
        }}
        canMutate={canMutate}
      />
    </div>
  );
  });
}

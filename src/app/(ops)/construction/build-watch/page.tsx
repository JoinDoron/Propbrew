import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { repos } from '@/server/data';
import { constructionWorld } from '@/server/reads/construction';
import { NOW_MS } from '@/domain/ppm';
import {
  projectEVMOf, forecastFinishISO, buildConfidence, coverageGaps, safetyStats,
  zoneProgress, zoneBand, milestoneBand,
} from '@/domain/construction';
import { BuildWatch, type WatchProject } from '@/components/construction/build-watch';

/** Investor Build-Watch — the client-facing mirror of delivery. Progress,
 *  a build-confidence index (schedule, cost, reporting discipline, safety),
 *  floor-by-floor structure and site updates drawn only from APPROVED reports.
 *  Commercial detail is withheld from view-only stakeholders. */
export default async function ConstructionBuildWatchPage() {
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const showCommercials = ['F', 'M'].includes(effectiveLevel(actor, 'reports_analytics'));
  const world = constructionWorld(actor);

  // Off-plan sales context, when this actor can see the investor portfolio.
  let offPlan: { id: string; unitsSold: number; unitsTotal: number }[] = [];
  try { offPlan = repos.investorProjects.list(actor).items.map((p) => ({ id: p.id, unitsSold: p.unitsSold, unitsTotal: p.unitsTotal })); } catch { /* no investor access */ }

  const projects: WatchProject[] = world.projects
    .filter((p) => p.status !== 'planning')
    .map((p) => {
      const evm = projectEVMOf(p, world.costCodes);
      const ff = forecastFinishISO(p, evm.spi);
      const gaps = coverageGaps(world.reports, p.id, NOW_MS, 7);
      const coverage = Math.round(((7 - gaps.length) / 7) * 100);
      const openCritical = world.issues.filter((i) => i.projectId === p.id && i.status !== 'resolved' && (i.severity === 'critical' || i.severity === 'high')).length;
      const safety = safetyStats(
        world.safetyEvents.filter((e) => e.projectId === p.id),
        world.safetyPermits.filter((x) => x.projectId === p.id),
        world.toolboxTalks.filter((t) => t.projectId === p.id),
        NOW_MS,
      );
      const sales = p.investorProjectId ? offPlan.find((o) => o.id === p.investorProjectId) : undefined;

      return {
        id: p.id, name: p.name, location: p.location, code: p.code,
        percentComplete: p.percentComplete, plannedPercent: p.plannedPercent,
        confidence: buildConfidence(evm, openCritical, coverage, safety.score),
        handoverISO: p.plannedFinishISO, forecastFinishISO: ff.iso, slipDays: Math.max(0, ff.slipDays),
        levels: world.zones.filter((z) => z.projectId === p.id).map((z) => ({ level: z.level, label: z.label, progress: zoneProgress(z), band: zoneBand(zoneProgress(z)) })).sort((a, b) => a.level - b.level),
        milestones: world.milestones.filter((m) => m.projectId === p.id).map((m) => ({ name: m.name, dueISO: m.dueISO, status: m.status, band: milestoneBand(m, NOW_MS) })),
        // Only APPROVED reports reach the client view.
        updates: world.reports
          .filter((r) => r.projectId === p.id && r.status === 'approved')
          .sort((a, b) => Date.parse(b.dateISO) - Date.parse(a.dateISO))
          .map((r) => ({ dateISO: r.dateISO, text: [...r.completed, ...r.ongoing].join('; ') || 'No completed or ongoing work description recorded.', photos: r.photos })),
        unitsSold: sales?.unitsSold, unitsTotal: sales?.unitsTotal,
        investorHref: sales ? '/investors' : undefined,
      };
    });

  return (
    <div className="pb-page">
      <BuildWatch projects={projects} showCommercials={showCommercials} />
    </div>
  );
}

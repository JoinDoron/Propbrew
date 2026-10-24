import { requireCapability } from '@/server/guard';
import { constructionWorld } from '@/server/reads/construction';
import { scoreSubcontractors } from '@/domain/construction';
import { LeagueWorkspace, type LeagueRow } from '@/components/construction/league-workspace';

/** Subcontractor League — one transparent composite (delivery 45%, quality 30%,
 *  safety 25%) applied identically to every trade, so performance is comparable
 *  and a firm can audit its own score before the next award decision. */
export default async function ConstructionLeaguePage() {
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const world = constructionWorld(actor);
  const nameOf = (id: string) => world.projects.find((p) => p.id === id)?.name ?? id;

  const rows: LeagueRow[] = scoreSubcontractors(world.subcontractors).map((s) => ({
    id: s.sub.id, name: s.sub.name, trade: s.sub.trade, rank: s.rank, score: s.score, band: s.band,
    deliveryPct: s.deliveryPct, qualityScore: s.qualityScore, safetyScore: s.safetyScore,
    tasksCompleted: s.sub.tasksCompleted, tasksOnTime: s.sub.tasksOnTime, defects: s.sub.defects,
    reworkMinor: s.sub.reworkCost.minor, safetyIncidents: s.sub.safetyIncidents, crewSize: s.sub.crewSize,
    valueMinor: s.valueMinor, projects: s.sub.projectIds.map(nameOf),
  }));

  return (
    <div className="pb-page">
      <LeagueWorkspace
        rows={rows}
        kpis={{
          subs: rows.length,
          avgScore: rows.length ? Math.round(rows.reduce((n, r) => n + r.score, 0) / rows.length) : 0,
          totalValueMinor: rows.reduce((n, r) => n + r.valueMinor, 0),
          reworkMinor: rows.reduce((n, r) => n + r.reworkMinor, 0),
        }}
      />
    </div>
  );
}

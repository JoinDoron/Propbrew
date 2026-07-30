import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { NOW_MS } from '@/domain/ppm';
import { reportBand, reportCompleteness, coverageGaps } from '@/domain/construction';
import { SiteWorkspace, type ReportRow } from '@/components/construction/site-workspace';

/** Daily Site Log — the PRD report state machine (draft → submitted → reviewed →
 *  approved, or returned with a reason), a completeness ring with missing-field
 *  nudges, cross-source consistency checks against geofenced attendance, and an
 *  immutable site diary compiled only from approved records. */
export default async function ConstructionSitePage() {
  const { actor } = await requireCapability('reports_analytics');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'reports_analytics'));
  const world = constructionWorld(actor);

  const nameOf = (id: string) => world.projects.find((p) => p.id === id)?.name ?? id;

  const reports: ReportRow[] = [...world.reports]
    .sort((a, b) => Date.parse(b.dateISO) - Date.parse(a.dateISO))
    .map((r) => {
      const c = reportCompleteness(r);
      const attendanceCount = world.attendance.filter((a) => a.projectId === r.projectId && a.dateISO === r.dateISO && a.status === 'present').length;
      const inconsistent = attendanceCount > 0 && Math.abs(r.workforceCount - attendanceCount) / Math.max(1, attendanceCount) > 0.15;
      return {
        id: r.id, projectName: nameOf(r.projectId), dateISO: r.dateISO, weather: r.weather, shift: r.shift,
        officer: r.officer, workforceCount: r.workforceCount, completed: [...r.completed], ongoing: [...r.ongoing],
        delayed: [...r.delayed], plannedNext: [...r.plannedNext], deliveries: [...r.deliveries],
        incidents: [...r.incidents], constraints: [...r.constraints], photos: r.photos, status: r.status,
        band: reportBand(r.status), completenessPct: c.pct, missing: c.missing, attendanceCount, inconsistent,
      };
    });

  // Coverage gaps for the busiest reporting project.
  const counts = new Map<string, number>();
  for (const r of world.reports) counts.set(r.projectId, (counts.get(r.projectId) ?? 0) + 1);
  const busiest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const gaps = coverageGaps(world.reports, busiest, NOW_MS, 7);

  return (
    <div className="max-w-[980px] mx-auto">
      <SiteWorkspace
        reports={reports}
        gaps={gaps}
        kpis={{
          approved: reports.filter((r) => r.status === 'approved').length,
          pending: reports.filter((r) => r.status !== 'approved').length,
          coverage: Math.round(((7 - gaps.length) / 7) * 100),
          incidents: reports.reduce((n, r) => n + r.incidents.length, 0),
        }}
        canMutate={canMutate}
      />
    </div>
  );
}

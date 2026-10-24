import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { operatingClock } from '@/server/operating-clock';
import { reportBand, reportCompleteness, coverageGaps } from '@/domain/construction';
import { SiteWorkspace, type ReportRow, type SiteIssueRow } from '@/components/construction/site-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** Daily Site Log — the PRD report state machine (draft → submitted → reviewed →
 *  approved, or returned with a reason), a completeness ring with missing-field
 *  nudges, cross-source consistency checks against geofenced attendance, and an
 *  immutable site diary compiled only from approved records. */
export default async function ConstructionSitePage() {
  return withDurableRead(async () => {
  const { nowMs: NOW_MS } = operatingClock();
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const canMutate = can(actor, 'reports_analytics', 'update').allowed;
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
  const issues: SiteIssueRow[] = [...world.issues]
    .sort((a, b) => Date.parse(b.raisedISO) - Date.parse(a.raisedISO))
    .map((issue) => ({
      id: issue.id, projectName: nameOf(issue.projectId), category: issue.category,
      title: issue.title, severity: issue.severity, owner: issue.owner, raisedISO: issue.raisedISO,
      dueISO: issue.dueISO, status: issue.status, correctiveAction: issue.correctiveAction,
    }));

  // Coverage gaps for the busiest reporting project.
  const counts = new Map<string, number>();
  for (const r of world.reports) counts.set(r.projectId, (counts.get(r.projectId) ?? 0) + 1);
  const busiest = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  const gaps = coverageGaps(world.reports, busiest, NOW_MS, 7);

  return (
    <div className="pb-page">
      <SiteWorkspace
        reports={reports}
        issues={issues}
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
  });
}

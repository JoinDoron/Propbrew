import { requireCapability } from '@/server/guard';
import { effectiveLevel } from '@/lib/authz';
import { constructionWorld } from '@/server/reads/construction';
import { costTimesheets, labourPosture, labourByCostCode } from '@/domain/construction';
import { TimesheetsWorkspace, type SheetRow, type CodeRow } from '@/components/construction/timesheets-workspace';

/** Timesheets — labour hours costed off day rates (overtime at 1.5×) and, on
 *  approval, POSTED to the cost code's actual. That posting is the link the PRD
 *  asks for: until a sheet is approved its cost is invisible to earned value,
 *  so the page shows exactly how much real spend CPI cannot yet see. */
export default async function ConstructionTimesheetsPage() {
  const { actor } = await requireCapability('reports_analytics');
  const canMutate = ['F', 'M'].includes(effectiveLevel(actor, 'reports_analytics'));
  const world = constructionWorld(actor);

  const views = costTimesheets(world.timesheets, world.workers);
  const posture = labourPosture(views);
  const byCodeRaw = labourByCostCode(views);

  const projectId = world.timesheets[0]?.projectId ?? world.projects[0]?.id ?? '';
  const project = world.projects.find((p) => p.id === projectId);

  const sheets: SheetRow[] = views.map((v) => {
    const w = world.workers.find((x) => x.id === v.ts.workerId);
    return {
      id: v.ts.id, ref: v.ts.ref, workerName: v.ts.workerName, weekEndingISO: v.ts.weekEndingISO,
      costCode: v.ts.costCode, normalHours: v.ts.normalHours, overtimeHours: v.ts.overtimeHours,
      status: v.ts.status, submittedBy: v.ts.submittedBy, approvedBy: v.ts.approvedBy, approvedISO: v.ts.approvedISO,
      costMinor: v.costMinor, band: v.band, dayRateMinor: w?.dayRate.minor ?? 0,
    };
  });

  const byCode: CodeRow[] = byCodeRaw.map((r) => {
    const cc = world.costCodes.find((c) => c.code === r.code && c.projectId === projectId);
    return { code: r.code, name: cc?.name ?? r.code, postedMinor: r.postedMinor, pendingMinor: r.pendingMinor, hours: r.hours, actualMinor: cc?.actual.minor ?? 0, budgetMinor: cc?.budget.minor ?? 0 };
  });

  return (
    <div className="max-w-[980px] mx-auto">
      <TimesheetsWorkspace sheets={sheets} byCode={byCode} posture={posture} projectName={project?.name ?? 'Project'} canMutate={canMutate} />
    </div>
  );
}

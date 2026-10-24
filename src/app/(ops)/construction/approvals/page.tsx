import { requireCapability } from '@/server/guard';
import { can } from '@/lib/authz';
import { constructionWorld, actorName } from '@/server/reads/construction';
import { operatingClock } from '@/server/operating-clock';
import { canApprove, overdueSteps, approvalProgress, reasonsFor } from '@/domain/construction';
import { ApprovalsWorkspace, type ReqView, type RuleView, type ReasonOption, type StepView } from '@/components/construction/approvals-workspace';
import { withDurableRead } from '@/server/data/durable-records';

/** Approvals — configurable routes selected by value and category, sequential
 *  AND parallel steps, SLA escalation, delegation, and segregation of duties
 *  (a requester can never approve their own transaction). Rejections require a
 *  coded reason so the Pareto downstream is real. */
export default async function ConstructionApprovalsPage() {
  return withDurableRead(async () => {
  const { nowMs: NOW_MS } = operatingClock();
  const { actor } = await requireCapability('reports_analytics', 'read', 'construction');
  const canMutate = can(actor, 'reports_analytics', 'update').allowed;
  const world = constructionWorld(actor);
  const myName = actorName(actor);
  const myRoles = actor.roles as string[];

  const requests: ReqView[] = world.approvals.map((r) => {
    const check = canApprove(r, myRoles, myName);
    const late = overdueSteps(r, NOW_MS);
    const lateKeys = new Set(late.map((s) => `${s.order}:${s.role}`));
    const steps: StepView[] = r.steps.map((s) => ({ ...s, overdue: lateKeys.has(`${s.order}:${s.role}`) }));
    return {
      id: r.id, ref: r.ref, subject: r.subject, subjectRef: r.subjectRef, title: r.title,
      amountMinor: r.amountMinor, raisedBy: r.raisedBy, raisedISO: r.raisedISO, status: r.status,
      ruleName: world.approvalRules.find((x) => x.id === r.ruleId)?.name ?? '—',
      steps, progressPct: approvalProgress(r).pct, note: r.note,
      mine: check.allowed, blockedReason: check.reason, overdue: late.length > 0,
    };
  }).sort((a, b) => Number(b.mine) - Number(a.mine) || Number(b.overdue) - Number(a.overdue) || Date.parse(b.raisedISO) - Date.parse(a.raisedISO));

  const rules: RuleView[] = world.approvalRules.filter((r) => r.active).map((r) => ({
    id: r.id, name: r.name, subject: r.subject, thresholdMinor: r.thresholdMinor,
    steps: r.steps.map((s) => ({ order: s.order, label: s.label, role: s.role, slaHours: s.slaHours })),
  })).sort((a, b) => a.subject.localeCompare(b.subject) || a.thresholdMinor - b.thresholdMinor);

  const reasons: ReasonOption[] = reasonsFor(world.reasonCodes, 'rejection').map((c) => ({ id: c.id, label: `${c.code} — ${c.label}`, requiresNote: c.requiresNote }));

  const inFlight = requests.filter((r) => r.status === 'in_flight');
  return (
    <div className="pb-page">
      <ApprovalsWorkspace
        requests={requests} rules={rules} reasons={reasons}
        kpis={{
          inbox: requests.filter((r) => r.mine).length,
          inFlight: inFlight.length,
          overdue: inFlight.filter((r) => r.overdue).length,
          valueMinor: inFlight.reduce((n, r) => n + r.amountMinor, 0),
        }}
        canMutate={canMutate}
      />
    </div>
  );
  });
}

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { requireCapability } from '@/server/guard';
import { can, type Role } from '@/lib/authz';
import { repos, seed } from '@/server/data';
import { getHistory } from '@/server/data/store';
import { workOrderMachine } from '@/domain/workflows';
import { Card, CardHeader } from '@/components/ui';
import { AiSuggestionCard, DomainStatus, Money, SlaBadge } from '@/components/domain';
import { Timeline } from '@/components/work-orders/timeline';
import { TransitionActions, type LegalEvent } from '@/components/work-orders/transition-actions';

const NOW = '2026-07-26T09:00:00Z';
const CLOSED = ['closed', 'cancelled', 'rejected', 'verified'];

const EVENT_META: Record<string, { label: string; variant: LegalEvent['variant']; needsAssignee: boolean }> = {
  TRIAGE: { label: 'Triage', variant: 'primary', needsAssignee: false },
  ASSIGN: { label: 'Assign', variant: 'primary', needsAssignee: true },
  REASSIGN: { label: 'Reassign', variant: 'default', needsAssignee: true },
  START: { label: 'Start work', variant: 'primary', needsAssignee: false },
  HOLD: { label: 'Put on hold', variant: 'default', needsAssignee: false },
  RESUME: { label: 'Resume', variant: 'primary', needsAssignee: false },
  RESOLVE: { label: 'Mark resolved', variant: 'primary', needsAssignee: false },
  VERIFY: { label: 'Verify', variant: 'primary', needsAssignee: false },
  CLOSE: { label: 'Close', variant: 'default', needsAssignee: false },
  REOPEN: { label: 'Reopen', variant: 'default', needsAssignee: false },
  REJECT: { label: 'Reject', variant: 'danger', needsAssignee: false },
  CANCEL: { label: 'Cancel', variant: 'danger', needsAssignee: false },
};

export default async function WorkOrderDetail({ params }: { params: Promise<{ ref: string }> }) {
  const { ref } = await params; // Next 16: params is async
  const { actor } = await requireCapability('work_orders');
  const wo = repos.workOrders.getByRef(actor, ref);
  if (!wo) notFound();

  const canTransition = can(actor, 'work_orders', 'transition').allowed;

  // The legal events for THIS actor from the current state (deduped by event).
  const legalEvents: LegalEvent[] = canTransition
    ? Array.from(
        new Map(
          workOrderMachine.transitions
            .filter((t) => t.from === wo.status && t.actors.some((a) => (actor.roles as Role[]).includes(a as Role)))
            .map((t) => [t.event, t]),
        ).keys(),
      )
        .filter((e) => EVENT_META[e])
        .map((e) => ({ event: e, ...EVENT_META[e] }))
    : [];

  const assignees = [
    ...seed.users.filter((u) => u.roles.includes('technician')).map((u) => u.name),
    ...seed.vendors.filter((v) => v.tenantId === actor.tenantId).map((v) => v.name),
  ];

  const history = getHistory('work-order', wo.id);
  const breached = !CLOSED.includes(wo.status) && (wo.respondDueAt ?? '') < NOW;
  const showAiTriage = ['new', 'triaged'].includes(wo.status) && canTransition;

  return (
    <div className="max-w-[1000px] mx-auto flex flex-col gap-3.5">
      <Link href="/work-orders" className="inline-flex items-center gap-1.5 text-[13px] text-text-3 hover:text-text-2 transition-colors w-fit">
        <ArrowLeft size={15} /> Work orders
      </Link>

      <Card>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="font-mono text-[15px] font-bold">{wo.ref}</span>
              <DomainStatus type="work_order" status={wo.status} />
              <SlaBadge dueAt={wo.respondDueAt} breached={breached} />
            </div>
            <h1 className="text-[19px] font-semibold tracking-[-0.02em] mt-2">{wo.title}</h1>
            <p className="text-[12.5px] text-text-3 mt-1">
              {wo.origin.replace(/_/g, ' ')} · raised by {wo.requesterName}
            </p>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-text-3 uppercase tracking-wide">Cost</div>
            <div className="text-[18px] font-semibold"><Money value={wo.cost} /></div>
          </div>
        </div>

        <div className="grid grid-cols-2 min-[560px]:grid-cols-4 gap-4 mt-4 pt-4 border-t border-border">
          <Field label="Priority" value={wo.priority} />
          <Field label="Assignee" value={wo.assigneeName} />
          <Field label="Respond by" value={fmt(wo.respondDueAt)} />
          <Field label="Resolve by" value={fmt(wo.resolveDueAt)} />
        </div>
      </Card>

      {showAiTriage && (
        <AiSuggestionCard
          featureId="AI-F-02"
          title="Suggested triage"
          confidence={0.88}
          sources={['3 similar past jobs', 'asset service history']}
        >
          Category <strong>Elevators</strong>, priority <strong>High</strong>, best-fit assignee{' '}
          <strong>{assignees[0] ?? 'a technician'}</strong>. Confirm to apply, or triage manually below.
        </AiSuggestionCard>
      )}

      <div className="grid grid-cols-1 min-[720px]:grid-cols-[1fr_320px] gap-3.5 items-start">
        <Card>
          <CardHeader title="Actions" subtitle={`Legal moves from “${wo.status.replace(/_/g, ' ')}” for your role`} />
          <div className="mt-3">
            {canTransition ? (
              <TransitionActions woRef={wo.ref} events={legalEvents} assignees={assignees} />
            ) : (
              <p className="text-[13px] text-text-3">You have view-only access to work orders.</p>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="History" subtitle="Every transition, attributed" />
          <div className="mt-3">
            <Timeline machineKey="work-order" entries={history} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-text-3 uppercase tracking-wide">{label}</div>
      <div className="text-[13.5px] font-medium mt-0.5 capitalize">{value}</div>
    </div>
  );
}

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

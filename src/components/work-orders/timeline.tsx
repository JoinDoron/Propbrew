import { StatusPill } from '@/components/ui';
import { humanizeStatus, statusTone } from '@/lib/status-tones';
import type { MachineKey } from '@/domain/workflows';
import type { HistoryEntry } from '@/server/data/store';

/** The §10 audit trail for any transactional record — every transition,
 *  timestamped and actor-attributed. The SC-10 audit view in miniature, shared
 *  across all five machines. */
export function Timeline({ machineKey, entries }: { machineKey: MachineKey; entries: HistoryEntry[] }) {
  const ordered = [...entries].reverse(); // newest first
  if (ordered.length === 0) return <p className="text-[13px] text-text-3">No history yet.</p>;
  return (
    <ol className="flex flex-col">
      {ordered.map((e, i) => (
        <li key={e.seq} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span className={`w-2.5 h-2.5 rounded-full mt-1.5 flex-none ${i === 0 ? 'bg-primary' : 'bg-border-2'}`} />
            {i < ordered.length - 1 && <span className="w-px flex-1 bg-border my-1" />}
          </div>
          <div className="pb-4 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[13px] font-semibold">{eventLabel(e.event)}</span>
              <StatusPill status={humanizeStatus(e.to)} tone={statusTone(machineKey, e.to)} />
            </div>
            <div className="text-[12px] text-text-3 mt-0.5">
              {e.actorName} · {formatWhen(e.at)}
            </div>
            {e.note && <div className="text-[12.5px] text-text-2 mt-1 italic">“{e.note}”</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}

const EVENT_LABELS: Record<string, string> = {
  CREATE: 'Created',
  TRIAGE: 'Triaged',
  ASSIGN: 'Assigned',
  REASSIGN: 'Reassigned',
  START: 'Work started',
  HOLD: 'Put on hold',
  RESUME: 'Resumed',
  RESOLVE: 'Marked resolved',
  VERIFY: 'Verified',
  CLOSE: 'Closed',
  AUTO_CLOSE: 'Auto-closed',
  REJECT: 'Rejected',
  CANCEL: 'Cancelled',
  REOPEN: 'Reopened',
  // billing
  ISSUE: 'Issued',
  PAYMENT_CONFIRMED: 'Payment received',
  DUE_DATE_PASSED: 'Became overdue',
  // booking
  APPROVE: 'Approved',
  AUTO_APPROVE: 'Auto-approved',
  DECLINE: 'Declined',
  CONFIRM: 'Confirmed',
  COMPLETE: 'Completed',
  // sos
  RAISE: 'Raised',
  ACKNOWLEDGE: 'Acknowledged',
  RESPOND: 'Responding',
  REVIEW: 'Reviewed',
  // marketplace
  PLACE: 'Placed',
  ACCEPT: 'Accepted',
  FULFIL: 'Fulfilled',
  REFUND: 'Refunded',
};

function eventLabel(event: string): string {
  return EVENT_LABELS[event] ?? humanizeStatus(event);
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

import { EmptyState, StatusPill } from '@/components/ui';
import polish from '@/components/facility/facility-registers-polish.module.css';
import { humanizeStatus, statusTone } from '@/lib/status-tones';
import type { MachineKey } from '@/domain/workflows';
import type { HistoryEntry } from '@/server/data/store';

/** The §10 audit trail for any transactional record — every transition,
 *  timestamped and actor-attributed. The SC-10 audit view in miniature, shared
 *  across all five machines. */
export function Timeline({ machineKey, entries }: { machineKey: MachineKey; entries: HistoryEntry[] }) {
  const ordered = [...entries].reverse();
  if (!ordered.length) return <EmptyState title="No history yet" description="Attributed transitions appear here after an authorised action is recorded." />;
  return <ol className={polish.timeline}>{ordered.map((entry, index) => <li key={entry.seq}><div className={polish.timelineRail} aria-hidden="true"><span className={polish.timelineDot} />{index < ordered.length - 1 ? <span /> : null}</div><div className={polish.timelineContent}><div><h4>{eventLabel(entry.event)}</h4><StatusPill status={humanizeStatus(entry.to)} tone={statusTone(machineKey, entry.to)} /></div><p className={`${polish.metadata} mt-3`}>{entry.actorName} · {humanizeStatus(entry.actorRole)} · <time dateTime={entry.at}>{formatWhen(entry.at)}</time></p>{entry.note ? <blockquote>{entry.note}</blockquote> : null}</div></li>)}</ol>;
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
  return `${new Date(iso).toLocaleString('en-NG', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })} WAT`;
}

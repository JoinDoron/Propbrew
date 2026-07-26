/**
 * Compute which transition events an actor may fire from a given state, and map
 * them to button metadata. Shared by the screens that render inline actions so
 * the UI offers only legal moves (the server action re-checks).
 */

import type { Actor } from '@/lib/authz';
import type { Machine } from '@/domain/workflows';
import type { Role } from '@/domain/enums';
import type { InlineEvent } from '@/components/inline-actions';

const EVENT_META: Record<string, { label: string; variant: InlineEvent['variant'] }> = {
  // booking
  APPROVE: { label: 'Approve', variant: 'primary' },
  DECLINE: { label: 'Decline', variant: 'danger' },
  CANCEL: { label: 'Cancel', variant: 'danger' },
  CONFIRM: { label: 'Confirm', variant: 'primary' },
  COMPLETE: { label: 'Complete', variant: 'default' },
  // sos
  ACKNOWLEDGE: { label: 'Acknowledge', variant: 'primary' },
  RESPOND: { label: 'Respond', variant: 'primary' },
  RESOLVE: { label: 'Resolve', variant: 'default' },
  REVIEW: { label: 'Review', variant: 'default' },
  // marketplace
  ACCEPT: { label: 'Accept', variant: 'primary' },
  FULFIL: { label: 'Fulfil', variant: 'primary' },
  REFUND: { label: 'Refund', variant: 'danger' },
  CLOSE: { label: 'Close', variant: 'default' },
};

/** Legal, actor-permitted events out of `status`, deduped and button-ready. */
export function legalEvents(machine: Machine<string>, status: string, actor: Actor): InlineEvent[] {
  const events = new Set(
    machine.transitions
      .filter((t) => t.from === status && t.actors.some((a) => (actor.roles as Role[]).includes(a as Role)))
      .map((t) => t.event),
  );
  return [...events].filter((e) => EVENT_META[e]).map((e) => ({ event: e, ...EVENT_META[e] }));
}

'use client';

/**
 * The action panel on a work-order detail page. It renders ONLY the transitions
 * the server already decided this actor may fire from the current state (via the
 * §10 machine + §7 capability), so the UI can never offer an illegal move — and
 * the server action re-checks anyway (defence in depth, SC-01).
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { fireWoTransition } from '@/server/actions/work-orders';

export type LegalEvent = { event: string; label: string; variant: 'primary' | 'default' | 'danger'; needsAssignee: boolean };

export function TransitionActions({
  woRef,
  events,
  assignees,
}: {
  woRef: string;
  events: LegalEvent[];
  assignees: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<string | null>(null);
  const [assignee, setAssignee] = useState(assignees[0] ?? '');

  function fire(event: string, opts?: { assignee?: string }) {
    setError(null);
    startTransition(async () => {
      const res = await fireWoTransition(woRef, event, opts);
      if (!res.ok) setError(res.error);
      else {
        setAssignFor(null);
        router.refresh();
      }
    });
  }

  if (events.length === 0) {
    return <p className="text-[13px] text-text-3">No actions available to you from this state.</p>;
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-2">
        {events.map((e) =>
          e.needsAssignee ? (
            <Button key={e.event} variant={e.variant === 'primary' ? 'primary' : 'secondary'} disabled={pending} onClick={() => setAssignFor(assignFor === e.event ? null : e.event)}>
              {e.label}
            </Button>
          ) : (
            <Button
              key={e.event}
              variant={e.variant === 'primary' ? 'primary' : 'secondary'}
              disabled={pending}
              onClick={() => fire(e.event)}
              className={e.variant === 'danger' ? '!text-negative' : undefined}
            >
              {e.label}
            </Button>
          ),
        )}
      </div>

      {assignFor && (
        <div className="flex items-center gap-2 p-3 rounded-xl border border-border bg-surface-2">
          <select
            aria-label="Assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="h-9 px-2.5 rounded-lg border border-border-2 bg-surface text-[13px] outline-none focus:border-primary"
          >
            {assignees.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <Button variant="primary" disabled={pending} onClick={() => fire(assignFor, { assignee })}>
            Confirm {events.find((e) => e.event === assignFor)?.label.toLowerCase()}
          </Button>
        </div>
      )}

      {error && <p className="text-[12.5px] text-negative">{error}</p>}
    </div>
  );
}

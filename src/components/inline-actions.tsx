'use client';

/**
 * Inline transition buttons for booking / SOS / marketplace rows. The server
 * computes which events this actor may fire from the row's current state (via
 * the §10 machine) and passes them here; the action re-checks. Same
 * offer-only-legal-moves contract as the work-order detail panel.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { transition } from '@/server/actions/transitions';

export type InlineEvent = { event: string; label: string; variant: 'primary' | 'default' | 'danger' };

export function InlineActions({
  machineKey,
  id,
  events,
}: {
  machineKey: 'booking' | 'sos-event' | 'marketplace-order';
  id: string;
  events: InlineEvent[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (events.length === 0) return <span className="text-[12px] text-text-3">—</span>;

  function fire(event: string) {
    setError(null);
    startTransition(async () => {
      const res = await transition(machineKey, id, event);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-1.5 flex-wrap justify-end">
      {events.map((e) => (
        <button
          key={e.event}
          disabled={pending}
          onClick={() => fire(e.event)}
          className={`pb-action ${`h-7 px-2.5 rounded-lg text-[12px] font-medium border transition-colors disabled:opacity-50 ${
            e.variant === 'primary'
              ? 'bg-primary text-white border-transparent hover:brightness-105'
              : e.variant === 'danger'
                ? 'bg-surface border-border text-negative hover:bg-surface-2'
                : 'bg-surface border-border text-text-2 hover:bg-surface-2'
          }`}`}
        >
          {e.label}
        </button>
      ))}
      {error && <span className="text-[11px] text-negative w-full text-right">{error}</span>}
    </div>
  );
}

'use client';

/** The resident's SOS trigger (EM-06). Creates a `raised` event via the server
 *  action, which alerts security and starts the sub-60s acknowledge clock. */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { LifeBuoy } from 'lucide-react';
import { raiseSos } from '@/server/actions/transitions';

export function RaiseSosButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <button
        disabled={pending}
        onClick={() => start(async () => {
          const r = await raiseSos();
          if (!r.ok) setError(r.error);
          else router.refresh();
        })}
        className="inline-flex items-center gap-2 h-11 px-5 rounded-xl text-sm font-semibold text-white bg-[color:var(--tone-danger)] hover:brightness-105 transition disabled:opacity-50"
      >
        <LifeBuoy size={18} />
        {pending ? 'Alerting…' : 'Raise SOS'}
      </button>
      {error && <span className="text-[11px] text-negative">{error}</span>}
    </span>
  );
}

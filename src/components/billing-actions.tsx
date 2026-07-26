'use client';

/**
 * Billing action buttons. `PayButton` is the resident's SC-02 payment
 * initiation; `IssueButton` is the manager issuing a draft charge. Both call
 * server actions that re-authorise and record the transition.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { issueInvoice, payInvoice } from '@/server/actions/transitions';
import { Button } from '@/components/ui';

export function PayButton({ invoiceRef }: { invoiceRef: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        variant="primary"
        disabled={pending}
        className="!h-8 !px-3 !text-[12px]"
        onClick={() => start(async () => {
          const r = await payInvoice(invoiceRef);
          if (!r.ok) setError(r.error);
          else router.refresh();
        })}
      >
        {pending ? 'Paying…' : 'Pay now'}
      </Button>
      {error && <span className="text-[11px] text-negative">{error}</span>}
    </span>
  );
}

export function IssueButton({ invoiceRef }: { invoiceRef: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      onClick={() => start(async () => {
        await issueInvoice(invoiceRef);
        router.refresh();
      })}
      className="h-7 px-2.5 rounded-lg text-[12px] font-medium border border-border bg-surface text-primary hover:bg-surface-2 transition-colors disabled:opacity-50"
    >
      {pending ? 'Issuing…' : 'Issue'}
    </button>
  );
}

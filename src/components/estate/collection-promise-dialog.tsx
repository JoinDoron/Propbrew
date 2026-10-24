'use client';

import { useId, useState, useTransition, type FormEvent } from 'react';
import { Check, Info, X } from 'lucide-react';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { Avatar, Button, IconButton } from '@/components/ui';
import { recordPromise } from '@/server/actions/estate';
import { UNVERIFIED_COLLECTION_INVOICE } from '@/domain/estate/collection-review';
import { collectionMoney, type CaseRow } from './collections-types';
import styles from './collection-promise-dialog.module.css';

export function CollectionPromiseDialog({ c, onClose, onDone }: {
  c: CaseRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const id = useId();
  const review = c.invoiceReview ?? UNVERIFIED_COLLECTION_INVOICE;
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(String(c.amountMinor / 100));
  // A new promise needs an explicitly agreed date, not the previous commitment.
  const [due, setDue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    if (!review.canFollowUp) { setError(review.detail); return; }

    const amountMajor = Number(amount);
    if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
      setError('Enter an amount greater than zero.');
      return;
    }
    if (Math.round(amountMajor * 100) > (review.outstandingMinor ?? 0)) { setError('A promise cannot exceed the recorded invoice balance.'); return; }
    if (!due) {
      setError('Pick a promise date.');
      return;
    }

    setError(null);
    start(async () => {
      try {
        const result = await recordPromise(c.id, amountMajor, due);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone();
      } catch {
        setError('The promise could not be recorded. Please try again.');
      }
    });
  }

  return (
    <PortalDialog label="Promise to pay" onClose={onClose} canClose={!pending} width={520}>
      <form onSubmit={submit} className={styles.panel} aria-busy={pending} aria-describedby={`${id}-notice`}>
        <header className={styles.header}>
          <div>
            <h2 className={styles.title}>Promise to pay</h2>
            <p className={styles.metadata}>Record an agreed amount and payment date.</p>
          </div>
          <IconButton type="button" aria-label="Close promise to pay" onClick={onClose} disabled={pending}>
            <X size={18} aria-hidden="true" />
          </IconButton>
        </header>

        <div className={styles.body}>
          <section className={styles.resident} aria-label="Collection case">
            <div className={styles.person}>
              <Avatar name={c.residentName} size={40} />
              <div>
                <p className={styles.name}>{c.residentName}</p>
                <p className={styles.metadata}>{c.unitLabel} · {c.invoiceRef}</p>
              </div>
            </div>
            <div className={styles.balance}>
              <span className={styles.metadata}>Outstanding balance</span>
              <span className={styles.amount}>{collectionMoney(c.amountMinor)}</span>
            </div>
          </section>

          {!review.canFollowUp && <p className={styles.error} role="alert">{review.detail}</p>}
          <fieldset className={styles.fields} disabled={pending || !review.canFollowUp}>
            <div className={styles.field}>
              <label htmlFor={`${id}-amount`}>Promised amount (NGN ₦)</label>
              <input id={`${id}-amount`} name="amount" type="number" inputMode="decimal" min="0.01" max={(review.outstandingMinor ?? c.amountMinor) / 100} step="0.01" required
                value={amount} onChange={(event) => setAmount(event.target.value)} autoFocus />
            </div>
            <div className={styles.field}>
              <label htmlFor={`${id}-due`}>Promised payment date</label>
              <input id={`${id}-due`} name="due" type="date" required value={due} onChange={(event) => setDue(event.target.value)} />
            </div>
          </fieldset>

          <div className={styles.notice} id={`${id}-notice`}>
            <Info size={18} aria-hidden="true" />
            <p>This records a promise, not a received payment. The case will move to the payment plan stage with a pending promise.</p>
          </div>

          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </div>

        <footer className={styles.actions}>
          <Button type="button" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" icon={<Check size={16} aria-hidden="true" />} disabled={pending || !review.canFollowUp}>
            {pending ? 'Recording…' : 'Record promise'}
          </Button>
        </footer>
      </form>
    </PortalDialog>
  );
}

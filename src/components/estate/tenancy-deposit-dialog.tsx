'use client';

import { useId, useState, useTransition, type FormEvent } from 'react';
import { Check, Info, X } from 'lucide-react';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { Avatar, Button, IconButton, StatusPill } from '@/components/ui';
import { settleDeposit } from '@/server/actions/estate';
import { canRecordDeposit, DEPOSIT_LABEL, DEPOSIT_TONE, tenancyMoney, type TenancyRow } from './tenancy-types';
import styles from './tenancy-deposit-dialog.module.css';

export function TenancyDepositDialog({ t, onClose, onDone }: {
  t: TenancyRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const amountId = useId();
  const helpId = useId();
  const errorId = useId();
  const [pending, start] = useTransition();
  const [refund, setRefund] = useState(() => (t.depositMinor / 100).toFixed(2));
  const [error, setError] = useState<string | null>(null);
  const depositMajor = t.depositMinor / 100;
  const amount = Number(refund);
  const validAmount = refund.trim() !== '' && Number.isFinite(amount) && amount >= 0 && amount <= depositMajor;
  const notMarkedMinor = validAmount ? Math.max(0, t.depositMinor - Math.round(amount * 100)) : null;
  const eligible = canRecordDeposit(t);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    setError(null);
    if (!eligible) {
      setError('This tenancy is not eligible for a deposit settlement record. Refresh the page to review its current status.');
      return;
    }
    if (!validAmount) {
      setError(`Enter an amount from ${tenancyMoney(0)} to ${tenancyMoney(t.depositMinor)}.`);
      return;
    }
    start(async () => {
      try {
        const result = await settleDeposit(t.id, Number(refund));
        if (!result.ok) {
          setError(result.error);
          return;
        }
        onDone();
      } catch {
        setError('The settlement record could not be saved. Please try again.');
      }
    });
  }

  return <PortalDialog label="Deposit settlement record" width={560} canClose={!pending} onClose={onClose}>
    <div className={styles.modal}>
      <header className={styles.header}>
        <div><h2 className={styles.title}>Deposit settlement record</h2><p className={styles.metadata}>Review the amount before saving a status change.</p></div>
        <IconButton type="button" aria-label="Close deposit settlement record" disabled={pending} onClick={onClose}><X size={18} aria-hidden="true" /></IconButton>
      </header>
      <form className={styles.body} onSubmit={submit} aria-busy={pending}>
        <section className={styles.resident} aria-label="Tenancy resident">
          <div className={styles.person}><Avatar name={t.residentName} size={40} /><div><p className={styles.recordTitle}>{t.residentName}</p><p className={styles.metadata}>{t.unitLabel}</p></div></div>
          <StatusPill status={DEPOSIT_LABEL[t.depositStatus]} tone={DEPOSIT_TONE[t.depositStatus]} />
        </section>
        <dl className={styles.deposit}><dt>Recorded deposit</dt><dd>{tenancyMoney(t.depositMinor)}</dd></dl>
        <fieldset className={styles.fields} disabled={pending || !eligible}>
          <legend className="sr-only">Settlement amount</legend>
          <div className={styles.field}>
            <label className={styles.label} htmlFor={amountId}>Amount marked for return (₦)</label>
            <input id={amountId} name="refund" type="number" inputMode="decimal" step="0.01" min="0" max={depositMajor} required value={refund} onChange={(event) => { setRefund(event.target.value); setError(null); }} className={styles.input} aria-describedby={`${helpId}${error ? ` ${errorId}` : ''}`} aria-invalid={Boolean(error)} autoFocus />
            <p id={helpId} className={styles.metadata}>Enter an amount from {tenancyMoney(0)} to {tenancyMoney(t.depositMinor)}. Enter the amount in NGN.</p>
          </div>
          <dl className={styles.remainder}><dt>Amount not marked for return</dt><dd>{notMarkedMinor === null ? '—' : tenancyMoney(notMarkedMinor)}</dd></dl>
        </fieldset>
        {t.depositStatus === 'pending' && <p className={styles.secondary}>This deposit is marked as due, not confirmed as received. Check the underlying payment records before recording a settlement.</p>}
        <div className={styles.notice}><Info size={18} aria-hidden="true" /><p>Record only<span>Saving updates the deposit status in Propbrew. It does not initiate a bank transfer, verify a payment or issue a refund.</span></p></div>
        {!eligible && <p className={styles.error} role="alert">Only a moving-out or closed tenancy with a held or pending deposit can be recorded here. Refresh the page to review this tenancy.</p>}
        {error && <p id={errorId} className={styles.error} role="alert">{error}</p>}
        <div className={styles.actions}>
          <Button type="button" disabled={pending} onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" icon={<Check size={16} aria-hidden="true" />} disabled={pending || !eligible}>{pending ? 'Saving record…' : 'Save settlement record'}</Button>
        </div>
      </form>
    </div>
  </PortalDialog>;
}

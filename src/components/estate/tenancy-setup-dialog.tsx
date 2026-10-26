'use client';

import { useId, useRef, useState, useTransition, type FormEvent } from 'react';
import { Check, FileText, X } from 'lucide-react';
import { Button, IconButton } from '@/components/ui';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { createEstateTenancyAgreement, updateEstateTenancyAgreement } from '@/server/actions/estate-tenancy-setup';
import { RENT_FREQUENCIES, RENT_FREQUENCY_LABELS, type RentFrequency, type TenancyResidentOption } from '@/domain/estate/tenancy-setup';
import type { TenancyRow } from './tenancy-types';
import styles from './tenancy-setup-dialog.module.css';

const decimal = (minor: number) => `${Math.trunc(minor / 100)}.${String(minor % 100).padStart(2, '0')}`;
export function TenancySetupDialog({ companyScope, residents, agreement, onClose, onDone }: {
  companyScope: string; residents: TenancyResidentOption[]; agreement?: TenancyRow; onClose: () => void; onDone: () => void;
}) {
  const id = useId(), detail = agreement?.agreement;
  const [residentId, setResidentId] = useState(detail?.residentId ?? '');
  const [startDate, setStartDate] = useState(detail?.startDate ?? '');
  const [endDate, setEndDate] = useState(detail?.endDate ?? '');
  const [rentAmount, setRentAmount] = useState(agreement ? decimal(agreement.rentMinor) : '');
  const [depositAmount, setDepositAmount] = useState(agreement ? decimal(agreement.depositMinor) : '0.00');
  const [frequency, setFrequency] = useState<RentFrequency>(detail?.rentFrequency ?? 'yearly');
  const [reference, setReference] = useState(detail?.agreementReference ?? '');
  const [notes, setNotes] = useState(detail?.notes ?? '');
  const [error, setError] = useState('');
  const [pending, start] = useTransition();
  const submitting = useRef(false), key = useRef<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const editing = Boolean(agreement);
  const resident = residents.find((option) => option.id === residentId);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || submitting.current) return;
    if (!resident || editing && !detail) { setError('Refresh this record and choose an available resident in their current unit.'); return; }
    if (!key.current) key.current = crypto.randomUUID();
    const input = { companyScope, residentId, expectedUnitId: resident.unitId, startDate, endDate, rentAmount, depositAmount,
      rentFrequency: frequency, agreementReference: reference, notes, idempotencyKey: key.current };
    submitting.current = true; setError('');
    start(async () => {
      try {
        const result = editing ? await updateEstateTenancyAgreement({ ...input, id: agreement!.id, expectedVersion: detail!.version }) : await createEstateTenancyAgreement(input);
        if (!result.ok) { setError(result.error); requestAnimationFrame(() => errorRef.current?.focus()); return; }
        onDone();
      } catch { setError('The agreement could not be saved. Check the connection and try again.'); requestAnimationFrame(() => errorRef.current?.focus()); }
      finally { submitting.current = false; }
    });
  }
  return <PortalDialog label={editing ? 'Edit draft tenancy agreement' : 'Create tenancy agreement'} width={680} canClose={!pending} onClose={onClose}>
    <section className={styles.modal}>
      <header className={styles.header}><div><h2>{editing ? 'Edit draft agreement' : 'Create tenancy agreement'}</h2><p>Record agreed terms for a resident and their current unit.</p></div><IconButton type="button" aria-label="Close tenancy agreement form" disabled={pending} onClick={onClose}><X size={18} /></IconButton></header>
      <form className={styles.body} onSubmit={submit} aria-busy={pending}>
        <fieldset className={styles.fields} disabled={pending}><legend className="sr-only">Tenancy agreement terms</legend>
          <label className={styles.wide} htmlFor={`${id}-resident`}>Resident and unit<select id={`${id}-resident`} value={residentId} onChange={(event) => { setResidentId(event.target.value); key.current = null; }} required disabled={editing}><option value="">Choose a resident</option>{residents.map((option) => <option key={option.id} value={option.id}>{option.name} · {option.estateName} · {option.unitLabel}</option>)}</select></label>
          <label htmlFor={`${id}-start`}>Lease start<input id={`${id}-start`} type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); key.current = null; }} required min="1900-01-01" max="2100-12-31" /></label>
          <label htmlFor={`${id}-end`}>Lease end<input id={`${id}-end`} type="date" value={endDate} onChange={(event) => { setEndDate(event.target.value); key.current = null; }} required min={startDate || '1900-01-01'} max="2100-12-31" /></label>
          <label htmlFor={`${id}-rent`}>Rent per cycle (₦)<input id={`${id}-rent`} type="text" inputMode="decimal" value={rentAmount} onChange={(event) => { setRentAmount(event.target.value); key.current = null; }} required maxLength={24} placeholder="e.g. 1500000.00" /></label>
          <label htmlFor={`${id}-frequency`}>Rent cycle<select id={`${id}-frequency`} value={frequency} onChange={(event) => { setFrequency(event.target.value as RentFrequency); key.current = null; }}>{RENT_FREQUENCIES.map((value) => <option key={value} value={value}>{RENT_FREQUENCY_LABELS[value]}</option>)}</select></label>
          <label htmlFor={`${id}-deposit`}>Deposit agreed (₦)<input id={`${id}-deposit`} type="text" inputMode="decimal" value={depositAmount} onChange={(event) => { setDepositAmount(event.target.value); key.current = null; }} required maxLength={24} /></label>
          <label htmlFor={`${id}-reference`}>Agreement reference (optional)<input id={`${id}-reference`} type="text" value={reference} onChange={(event) => { setReference(event.target.value); key.current = null; }} maxLength={120} /></label>
          <label className={styles.wide} htmlFor={`${id}-notes`}>Agreed terms or notes (optional)<textarea id={`${id}-notes`} rows={4} value={notes} onChange={(event) => { setNotes(event.target.value); key.current = null; }} maxLength={2000} /></label>
        </fieldset>
        <p className={styles.notice}><FileText size={17} aria-hidden="true" /><span>{editing ? 'Only application and screening terms can be edited. Approved terms need a separately authorised amendment.' : 'The agreement starts at Application. Review it through the tenancy stages. This records terms; it does not create a signed legal document, collect a deposit or activate a tenancy.'}</span></p>
        {error && <p role="alert" tabIndex={-1} ref={errorRef} className={styles.error}>{error}</p>}
        <footer className={styles.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" icon={<Check size={16} />} disabled={pending || !resident}>{pending ? 'Saving agreement…' : editing ? 'Save draft agreement' : 'Create agreement'}</Button></footer>
      </form>
    </section>
  </PortalDialog>;
}

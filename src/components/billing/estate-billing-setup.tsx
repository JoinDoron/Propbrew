'use client';

import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, FilePlus2, Pause, Play, Plus, RefreshCw, X } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, IconButton, StatusPill } from '@/components/ui';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { koboInput } from '@/domain/estate/billing-setup';
import type { Invoice } from '@/domain/entities';
import type { EstateBillingResidentOption, EstateRecurringRuleView } from '@/server/reads/estate-billing-setup';
import { createEstateInvoice, createEstateRecurringCharge, generateDueEstateCharges, issueEstateInvoice, setEstateRecurringChargeEnabled, updateEstateRecurringCharge, updateEstateInvoiceDraft, type EstateBillingResult } from '@/server/actions/estate-billing-setup';
import styles from './estate-billing-setup.module.css';

const amount = (minor: number) => new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(minor / 100);
export type BillingSetupProps = { companyId: string; residents: EstateBillingResidentOption[]; rules: EstateRecurringRuleView[]; today: string; canMutate: boolean };

export function InvoiceCreateButton({ companyId, residents, onCreated }: Pick<BillingSetupProps, 'companyId' | 'residents'> & { onCreated?: () => void }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="primary" icon={<Plus size={16} />} onClick={() => setOpen(true)}>Create invoice</Button>{open && <BillingEditorDialog companyId={companyId} residents={residents} onSaved={onCreated} onClose={() => setOpen(false)} />}</>;
}
export function InvoiceEditButton({ companyId, invoice }: { companyId: string; invoice: Invoice }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="ghost" aria-label={`Edit invoice ${invoice.ref}`} onClick={() => setOpen(true)}>Edit</Button>{open && <BillingEditorDialog companyId={companyId} residents={[]} invoice={invoice} onClose={() => setOpen(false)} />}</>;
}
export function InvoiceIssueButton({ companyId, invoice }: { companyId: string; invoice: Invoice }) {
  const [open, setOpen] = useState(false);
  return <><Button variant="ghost" aria-label={`Issue invoice ${invoice.ref}`} onClick={() => setOpen(true)}>Issue</Button>{open && <BillingConfirmation label="Issue invoice" companyId={companyId} onClose={() => setOpen(false)} action={() => issueEstateInvoice({ expectedCompanyId: companyId, invoiceId: invoice.id })}>
    <p>Issue <strong>{invoice.ref}</strong> for {invoice.residentName}: {new Intl.NumberFormat('en-NG', { style: 'currency', currency: invoice.amount.currency }).format(invoice.amount.minor / 100)}, due {invoice.dueDate}.</p><p>This records a live charge in the ledger. It does not collect money or confirm delivery of an external message.</p>
  </BillingConfirmation>}</>;
}
export function RecurringChargesPanel({ companyId, residents, rules, today, canMutate }: BillingSetupProps) {
  const [editor, setEditor] = useState<'new' | EstateRecurringRuleView | null>(null);
  const [confirm, setConfirm] = useState<EstateRecurringRuleView | 'generate' | null>(null);
  const [notice, setNotice] = useState('');
  const due = rules.filter((rule) => rule.enabled && rule.nextDate && rule.nextDate <= today).length;
  return <div className={styles.stack}>
    <div className={styles.notice}><CalendarClock size={19} aria-hidden="true" /><div><strong>Scheduled charges, reviewed before issue</strong><p>Due cycles create invoice drafts. Review and issue each invoice from the Invoices tab. No automatic penalties or payment collection. Dates follow Lagos time.</p></div></div>
    {notice && <p className={styles.feedback} role="status">{notice}</p>}
    <Card padded={false}><div className={styles.header}><CardHeader title="Recurring charges" subtitle={`${rules.length} configured · ${due} with cycles due`} action={canMutate ? <div className={styles.actions}><Button icon={<RefreshCw size={15} />} onClick={() => setConfirm('generate')}>Generate due drafts</Button><Button variant="primary" icon={<Plus size={15} />} onClick={() => setEditor('new')}>Create recurring charge</Button></div> : undefined} /></div>
      {rules.length ? <div className="pb-table-scroll" role="region" aria-label="Recurring charge register" tabIndex={0}><table className="pb-data-table"><thead><tr>{['Charge', 'Resident / unit', 'Amount', 'Schedule', 'Next cycle', 'Status', 'Actions'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead><tbody>{rules.map((rule) => <tr key={rule.id}><td><strong>{rule.description}</strong><span className={styles.secondary}>{rule.estateName}</span></td><td>{rule.residentName}<span className={styles.secondary}>{rule.unitLabel}</span></td><td>{amount(rule.amountMinor)}</td><td>{rule.frequency}<span className={styles.secondary}>Due {rule.dueOffsetDays} days after cycle</span></td><td>{rule.nextDate ?? 'Schedule ended'}{rule.nextDate && rule.nextDate <= today && rule.enabled && <span className={styles.secondary}>Draft generation due</span>}</td><td><StatusPill status={rule.needsReview ? 'Resident review needed' : !rule.enabled ? 'Paused' : !rule.nextDate ? 'Ended' : 'Active'} tone={rule.needsReview ? 'warn' : rule.enabled && rule.nextDate ? 'success' : 'muted'} /></td><td>{canMutate && <div className={styles.actions}><Button variant="ghost" disabled={!rule.nextDate || rule.nextDate <= today || rule.needsReview} aria-label={`Edit recurring charge ${rule.description}`} onClick={() => setEditor(rule)}>Edit</Button><Button variant="ghost" icon={rule.enabled ? <Pause size={14} /> : <Play size={14} />} aria-label={`${rule.enabled ? 'Pause' : 'Resume'} recurring charge ${rule.description}`} onClick={() => setConfirm(rule)}>{rule.enabled ? 'Pause' : 'Resume'}</Button></div>}</td></tr>)}</tbody></table></div> : <EmptyState icon={<CalendarClock size={24} />} title="No recurring charges yet" description="Create a monthly, quarterly or yearly charge for a resident in your property. Due cycles remain drafts until a manager issues them." />}
      <p className={styles.footnote}>Manual catch-up creates at most 24 drafts per run. Background processing also continues on schedule. A changed or moved-out resident blocks generation until the charge is reviewed. Paused periods are skipped when a charge resumes.</p>
    </Card>
    {editor && <BillingEditorDialog companyId={companyId} residents={residents} recurring rule={editor === 'new' ? undefined : editor} onClose={() => setEditor(null)} />}
    {confirm && <BillingConfirmation label={confirm === 'generate' ? 'Generate due invoice drafts' : `${confirm.enabled ? 'Pause' : 'Resume'} recurring charge`} companyId={companyId} onClose={() => setConfirm(null)} onResult={(message) => setNotice(message)} action={() => confirm === 'generate' ? generateDueEstateCharges({ expectedCompanyId: companyId }) : setEstateRecurringChargeEnabled({ expectedCompanyId: companyId, ruleId: confirm.id, expectedVersion: confirm.version, enabled: !confirm.enabled })}>
      <p>{confirm === 'generate' ? 'Create draft invoices for due cycles in your authorised estate scope. This does not issue charges or apply payments. Repeated runs do not duplicate the same charge cycle.' : confirm.enabled ? `Pause ${confirm.description}. Existing invoices stay in the ledger.` : `Resume ${confirm.description} from the next current or future cycle. Past paused periods will not be back-billed.`}</p>
    </BillingConfirmation>}
  </div>;
}
function BillingEditorDialog({ companyId, residents, onClose, recurring = false, rule, invoice, onSaved }: Pick<BillingSetupProps, 'companyId' | 'residents'> & { onClose: () => void; recurring?: boolean; rule?: EstateRecurringRuleView; invoice?: Invoice; onSaved?: () => void }) {
  const router = useRouter();
  const amountHint = useId();
  const [pending, start] = useTransition(), [error, setError] = useState('');
  const [key] = useState(() => crypto.randomUUID());
  const [residentId, setResidentId] = useState(rule?.residentId ?? '');
  const [description, setDescription] = useState(rule?.description ?? invoice?.description ?? '');
  const [chargeAmount, setChargeAmount] = useState(rule ? koboInput(rule.amountMinor) : invoice ? koboInput(invoice.amount.minor) : '');
  const [dueDate, setDueDate] = useState(invoice?.dueDate ?? ''), [frequency, setFrequency] = useState<'monthly' | 'quarterly' | 'yearly'>(rule?.frequency ?? 'monthly');
  const [startDate, setStartDate] = useState(''), [endDate, setEndDate] = useState(rule?.endDate ?? ''), [offset, setOffset] = useState(rule?.dueOffsetDays ?? 0);
  const submitting = useRef(false), errorRef = useRef<HTMLParagraphElement>(null);
  const title = invoice ? 'Edit invoice draft' : rule ? 'Edit recurring charge' : recurring ? 'Create recurring charge' : 'Create invoice';
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  function submit(event: React.FormEvent) {
    event.preventDefault(); if (pending || submitting.current) return; submitting.current = true;
    start(async () => {
      try {
        const common = { expectedCompanyId: companyId, description, amount: chargeAmount };
        const expectedUnitId = residents.find((resident) => resident.id === residentId)?.unitId ?? '';
        const result = invoice ? await updateEstateInvoiceDraft({ ...common, invoiceId: invoice.id, idempotencyKey: key, dueDate, expectedSnapshot: JSON.stringify([invoice.description, invoice.amount.minor, invoice.dueDate]) }) : rule ? await updateEstateRecurringCharge({ ...common, ruleId: rule.id, expectedVersion: rule.version, endDate: endDate || null, dueOffsetDays: offset })
          : recurring ? await createEstateRecurringCharge({ ...common, idempotencyKey: key, residentId, expectedUnitId, frequency, startDate, endDate: endDate || null, dueOffsetDays: offset })
          : await createEstateInvoice({ ...common, idempotencyKey: key, residentId, expectedUnitId, dueDate });
        if (!result.ok) setError(result.error); else { router.refresh(); onSaved?.(); onClose(); }
      } catch { setError('The change could not be saved. Your details are still here; reconnect and try again.'); }
      finally { submitting.current = false; }
    });
  }
  return <PortalDialog label={title} width={620} onClose={onClose} canClose={!pending}><form className={styles.dialog} onSubmit={submit} aria-busy={pending}>
    <header className={styles.dialogHeader}><div><h2>{title}</h2><p>{rule ? 'Update future cycles. Existing invoices stay unchanged.' : recurring ? 'Create scheduled drafts for manager review.' : 'Save a one-off charge as a draft for review.'}</p></div><IconButton type="button" aria-label={`Close ${title.toLowerCase()}`} disabled={pending} onClick={onClose}><X size={18} /></IconButton></header>
    <fieldset disabled={pending} className={styles.fields}><legend className="sr-only">{title} details</legend>
      {!rule && !invoice && <label className={styles.wide}>Resident<select required value={residentId} onChange={(event) => setResidentId(event.target.value)}><option value="">Choose a billable resident</option>{residents.map((resident) => <option key={resident.id} value={resident.id}>{resident.name} · {resident.estateName} · {resident.unitLabel}</option>)}</select>{residents.length === 0 && <span>Add a resident to an occupied or reserved unit before creating a charge.</span>}</label>}
      {invoice && <p className={styles.wide}>{invoice.ref} · {invoice.residentName}</p>}
      <label className={styles.wide}>Charge description<input required minLength={2} maxLength={240} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Estate service charge" /></label>
      <label>Amount (₦)<input aria-label="Amount (₦)" aria-describedby={amountHint} required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" maxLength={20} value={chargeAmount} onChange={(event) => setChargeAmount(event.target.value)} placeholder="e.g. 25000.50" /><span id={amountHint}>NGN only · exact kobo, no currency conversion</span></label>
      {!recurring && <label>Due date<input required type="date" min="1900-01-01" max="2100-12-31" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>}
      {recurring && <>{!rule && <><label>Frequency<select value={frequency} onChange={(event) => setFrequency(event.target.value as typeof frequency)}><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option><option value="yearly">Yearly</option></select></label><label>First cycle date<input required type="date" min="1900-01-01" max="2100-12-31" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label></>}<label>End date (optional)<input type="date" min={rule?.startDate || startDate || '1900-01-01'} max="2100-12-31" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><label>Due after cycle (days)<input required type="number" min={0} max={90} step={1} value={offset} onChange={(event) => setOffset(Number(event.target.value))} /></label></>}
    </fieldset>
    {error && <p ref={errorRef} tabIndex={-1} role="alert" className={styles.error}>{error}</p>}
    <p className={styles.footnote}>{recurring ? 'Month-end dates keep the original anchor: January 31 → February 28/29 → March 31. Pause and resume never change existing invoice balances.' : 'Drafts do not count as collected or billed amounts until issued. No money is collected by saving this form.'}</p>
    <footer className={styles.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending || !rule && !invoice && residents.length === 0} icon={recurring ? <CalendarClock size={16} /> : <FilePlus2 size={16} />}>{pending ? 'Saving…' : invoice ? 'Save draft changes' : rule ? 'Save future terms' : recurring ? 'Save recurring charge' : 'Save invoice draft'}</Button></footer>
  </form></PortalDialog>;
}
function BillingConfirmation({ label, children, onClose, onResult, action }: { label: string; companyId: string; children: React.ReactNode; onClose: () => void; onResult?: (message: string) => void; action: () => Promise<EstateBillingResult> }) {
  const router = useRouter(), [pending, start] = useTransition(), [error, setError] = useState(''); const submitting = useRef(false);
  return <PortalDialog label={label} width={540} onClose={onClose} canClose={!pending}><div className={styles.dialog}><header className={styles.dialogHeader}><h2>{label}</h2><IconButton aria-label={`Close ${label.toLowerCase()}`} onClick={onClose} disabled={pending}><X size={18} /></IconButton></header><div className={styles.copy}>{children}</div>{error && <p role="alert" className={styles.error}>{error}</p>}<footer className={styles.actions}><Button disabled={pending} onClick={onClose}>Cancel</Button><Button variant="primary" disabled={pending} onClick={() => { if (pending || submitting.current) return; submitting.current = true; start(async () => { try { const result = await action(); if (!result.ok) setError(result.error); else { onResult?.(result.message); router.refresh(); onClose(); } } catch { setError('This change could not be saved. Reconnect and refresh before trying again.'); } finally { submitting.current = false; } }); }}>{pending ? 'Saving…' : `Confirm ${label.toLowerCase()}`}</Button></footer></div></PortalDialog>;
}

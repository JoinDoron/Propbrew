'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Banknote, ClipboardCheck, RefreshCw, ShieldCheck, UserCheck } from 'lucide-react';
import { Button, Card, CardHeader, EmptyState, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { shortletMoney } from './shortlet-format';
import { ShortletFeedback, ShortletMetric, ShortletNotice, shortletStyles } from './reference-ui';
import { approveShortletTransaction, assignTurnover, decideShortletApproval, generateTurnoverTasks, matchShortletTransaction, reviewGuestVerification, submitGuestVerification, submitShortletTransaction, updateTurnover } from '@/server/actions/shortlet-control';
import styles from './shortlet-specialists-polish.module.css';

type Booking = { id: string; ref: string; guest: string; apt: string; status: string; totalMinor: number; paidMinor: number; cautionMinor: number; readiness?: { id: string; status: string; documentType: string; documentLast4: string; consentAtISO: string } };
type Transaction = { id: string; bookingId: string; ref: string; guest: string; kind: string; amountMinor: number; method: string; reference: string; status: string; requestedAtISO: string };
type Turnover = { id: string; bookingId: string; ref: string; apt: string; dueAtISO: string; assigneeId?: string; assigneeName?: string; status: string; checklist: { key: string; label: string; done: boolean }[]; maintenanceIssues: number };
type Member = { id: string; name: string; role: string };
type Approval = { id: string; kind: string; title: string; summary: string; status: string; requestedAtISO: string };

const label = (value: string) => value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const tone = (status: string) => status === 'verified' || status === 'completed' || status === 'ready' || status === 'approved' ? 'success' : status === 'rejected' || status === 'blocked' ? 'danger' : status === 'pending_review' || status === 'pending_match' || status === 'pending' ? 'warn' : 'info';

export function OperationsControlWorkspace({ bookings, transactions, turnovers, members, approvals, canCreate, canUpdate }: { bookings: Booking[]; transactions: Transaction[]; turnovers: Turnover[]; members: Member[]; approvals: Approval[]; canCreate: boolean; canUpdate: boolean }) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const pendingApprovals = approvals.filter((row) => row.status === 'pending').length;
  const verified = bookings.filter((row) => row.readiness?.status === 'verified').length;
  const readyTurnovers = turnovers.filter((row) => row.status === 'ready').length;
  const unmatched = transactions.filter((row) => ['pending_match', 'matched'].includes(row.status)).length;
  const done = (value: string) => { setMessage(value); router.refresh(); };

  return <div className={styles.stack}>
    <ShortletNotice>Shortlet operations control<p className={styles.text}>These records are company-scoped and durable. Identity evidence is minimised to an operator attestation and final four characters; payment references still require bank or gateway evidence before approval.</p></ShortletNotice>
    <div className={shortletStyles.metrics}>
      <ShortletMetric label="Verified guests" value={`${verified} / ${bookings.length}`} icon={<UserCheck size={18} />} />
      <ShortletMetric label="Finance items awaiting action" value={String(unmatched)} icon={<Banknote size={18} />} />
      <ShortletMetric label="Apartments ready" value={`${readyTurnovers} / ${turnovers.length}`} icon={<ClipboardCheck size={18} />} />
      <ShortletMetric label="Pending approvals" value={String(pendingApprovals)} icon={<ShieldCheck size={18} />} />
    </div>
    <PageTabs label="Shortlet operating controls" items={[
      { id: 'readiness', label: 'Guest readiness', content: <GuestReadiness bookings={bookings} allowed={canUpdate} onDone={done} /> },
      { id: 'finance', label: 'Payments & refunds', content: <FinanceLedger bookings={bookings} transactions={transactions} canCreate={canCreate} canUpdate={canUpdate} onDone={done} /> },
      { id: 'turnovers', label: 'Turnovers', content: <Turnovers turnovers={turnovers} members={members} allowed={canUpdate} onDone={done} /> },
      { id: 'approvals', label: `Approvals${pendingApprovals ? ` (${pendingApprovals})` : ''}`, content: <Approvals approvals={approvals} allowed={canUpdate} onDone={done} /> },
    ]} />
    {message ? <ShortletFeedback message={message} onClose={() => setMessage(null)} /> : null}
  </div>;
}

function GuestReadiness({ bookings, allowed, onDone }: { bookings: Booking[]; allowed: boolean; onDone: (message: string) => void }) {
  const [bookingId, setBookingId] = useState(bookings.find((row) => !row.readiness || row.readiness.status !== 'verified')?.id ?? bookings[0]?.id ?? '');
  const [documentType, setDocumentType] = useState('nin');
  const [last4, setLast4] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    setError(null);
    try {
      const result = await submitGuestVerification({ bookingId, documentType: documentType as never, documentLast4: last4, consentAccepted: consent });
      if (!result.ok) return setError(result.error);
      setLast4(''); setConsent(false); onDone(result.message ?? 'Verification submitted.');
    } catch { setError('The verification could not be submitted. Refresh before trying again.'); }
  });
  return <div className={styles.stack}>
    <Card><CardHeader title="Identity and consent check" subtitle="NDPA-conscious readiness before arrival" action={<BadgeCheck size={18} className="text-primary" />} /><div className={styles.formGrid}><label className={styles.field}>Booking<select value={bookingId} onChange={(event) => setBookingId(event.target.value)} className="pb-form-control" disabled={!allowed || pending}>{bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.ref} · {booking.guest} · {booking.apt}</option>)}</select></label><label className={styles.field}>Identity type<select value={documentType} onChange={(event) => setDocumentType(event.target.value)} className="pb-form-control" disabled={!allowed || pending}><option value="nin">NIN</option><option value="passport">Passport</option><option value="drivers_licence">Driver’s licence</option><option value="voters_card">Voter’s card</option><option value="other">Other approved ID</option></select></label><label className={styles.field}>Final four characters<input value={last4} maxLength={4} onChange={(event) => setLast4(event.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase())} className="pb-form-control" placeholder="1234" disabled={!allowed || pending} /></label><label className={styles.field}><span>Guest consent</span><span className={styles.identity}><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} disabled={!allowed || pending} /> Guest consent to identity processing is recorded</span></label></div><p className={styles.metadata + ' mt-4'}>Do not upload or type a full NIN, passport or licence number here. Propbrew stores only the document type, last four characters, consent time and review decision.</p>{error ? <p role="alert" className="text-negative mt-4">{error}</p> : null}<div className={styles.actions + ' mt-6'}><Button variant="primary" onClick={submit} disabled={!allowed || pending || !bookingId || last4.length !== 4 || !consent}>{pending ? 'Submitting…' : 'Submit for review'}</Button></div></Card>
    <Card padded={false}><div className={styles.header}><CardHeader title="Guest readiness register" subtitle="Verification must be approved before the booking can check in" /></div>{bookings.length ? <div className={styles.scroll} role="region" tabIndex={0} aria-label="Guest readiness register"><table className={'pb-data-table ' + styles.table}><thead><tr><th>Booking</th><th>Guest</th><th>Apartment</th><th>Identity check</th><th>Stay status</th><th>Action</th></tr></thead><tbody>{bookings.map((booking) => <tr key={booking.id}><th>{booking.ref}</th><td>{booking.guest}</td><td>{booking.apt}</td><td><StatusPill status={label(booking.readiness?.status ?? 'not_started')} tone={tone(booking.readiness?.status ?? 'not_started') as never} />{booking.readiness ? <p className={styles.metadata}>{label(booking.readiness.documentType)} · ending {booking.readiness.documentLast4}</p> : null}</td><td><StatusPill status={label(booking.status)} tone="neutral" /></td><td>{booking.readiness?.status === 'pending_review' ? <div className={styles.actions}><Action label="Approve" disabled={!allowed} action={() => reviewGuestVerification(booking.readiness!.id, 'approved')} onDone={onDone} /><Action label="Reject" disabled={!allowed} action={() => reviewGuestVerification(booking.readiness!.id, 'rejected')} onDone={onDone} danger /></div> : <span className={styles.metadata}>{booking.readiness?.status === 'verified' ? 'Ready for check-in control' : 'Submit evidence above'}</span>}</td></tr>)}</tbody></table></div> : <div className={styles.empty}><EmptyState title="No bookings in scope" description="Create a booking before recording guest readiness." /></div>}</Card>
  </div>;
}

function FinanceLedger({ bookings, transactions, canCreate, canUpdate, onDone }: { bookings: Booking[]; transactions: Transaction[]; canCreate: boolean; canUpdate: boolean; onDone: (message: string) => void }) {
  const [bookingId, setBookingId] = useState(bookings[0]?.id ?? '');
  const [kind, setKind] = useState('accommodation_payment');
  const [method, setMethod] = useState('bank_transfer');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    setError(null);
    try {
      const result = await submitShortletTransaction({ bookingId, kind: kind as never, amountNaira: Number(amount), method: method as never, reference });
      if (!result.ok) return setError(result.error);
      setAmount(''); setReference(''); onDone(result.message ?? 'Transaction recorded.');
    } catch { setError('The transaction could not be recorded. Refresh before trying again.'); }
  });
  return <div className={styles.stack}><Card><CardHeader title="Record a payment, deposit or refund" subtitle="NGN ledger with settlement matching and finance approval" /><div className={styles.formGrid}><label className={styles.field}>Booking<select value={bookingId} onChange={(event) => setBookingId(event.target.value)} disabled={!canCreate || pending} className="pb-form-control">{bookings.map((booking) => <option key={booking.id} value={booking.id}>{booking.ref} · {booking.guest}</option>)}</select></label><label className={styles.field}>Transaction type<select value={kind} onChange={(event) => setKind(event.target.value)} disabled={!canCreate || pending} className="pb-form-control"><option value="accommodation_payment">Accommodation payment</option><option value="caution_deposit">Caution deposit</option><option value="refund">Refund request</option><option value="damage_deduction">Damage deduction</option></select></label><label className={styles.field}>Method<select value={method} onChange={(event) => setMethod(event.target.value)} disabled={!canCreate || pending} className="pb-form-control"><option value="bank_transfer">Bank transfer</option><option value="paystack">Paystack</option><option value="flutterwave">Flutterwave</option><option value="cash">Cash</option><option value="other">Other</option></select></label><label className={styles.field}>Amount · NGN<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} disabled={!canCreate || pending} className="pb-form-control" /></label><label className={styles.field}>Bank / gateway reference<input value={reference} onChange={(event) => setReference(event.target.value)} disabled={!canCreate || pending} className="pb-form-control" placeholder="PSK_…, FLW_… or bank narration" /></label></div>{error ? <p role="alert" className="text-negative mt-4">{error}</p> : null}<div className={styles.actions + ' mt-6'}><Button variant="primary" onClick={submit} disabled={!canCreate || pending || !bookingId || !amount || reference.trim().length < 3}>{pending ? 'Recording…' : 'Record transaction'}</Button></div></Card><Card padded={false}><div className={styles.header}><CardHeader title="Settlement and refund register" subtitle="Match the external evidence, then approve the ledger posting" /></div>{transactions.length ? <div className={styles.scroll} role="region" tabIndex={0} aria-label="Shortlet finance register"><table className={'pb-data-table ' + styles.table}><thead><tr><th>Booking</th><th>Type</th><th>Amount</th><th>Method / reference</th><th>Status</th><th>Action</th></tr></thead><tbody>{transactions.map((row) => <tr key={row.id}><th>{row.ref}<p className={styles.metadata}>{row.guest}</p></th><td>{label(row.kind)}</td><td>{shortletMoney(row.amountMinor)}</td><td>{label(row.method)}<p className={styles.metadata}>{row.reference}</p></td><td><StatusPill status={label(row.status)} tone={tone(row.status) as never} /></td><td><div className={styles.actions}>{row.status === 'pending_match' ? <Action label="Match evidence" disabled={!canUpdate} action={() => matchShortletTransaction(row.id)} onDone={onDone} /> : null}{row.status === 'matched' || row.status === 'pending_match' && ['refund', 'damage_deduction'].includes(row.kind) ? <Action label="Approve" disabled={!canUpdate} action={() => approveShortletTransaction(row.id, 'approved')} onDone={onDone} /> : null}{['pending_match', 'matched'].includes(row.status) ? <Action label="Reject" disabled={!canUpdate} action={() => approveShortletTransaction(row.id, 'rejected')} onDone={onDone} danger /> : null}</div></td></tr>)}</tbody></table></div> : <div className={styles.empty}><EmptyState title="No finance control records" description="Record a payment, deposit or refund request above." /></div>}</Card></div>;
}

function Turnovers({ turnovers, members, allowed, onDone }: { turnovers: Turnover[]; members: Member[]; allowed: boolean; onDone: (message: string) => void }) {
  return <div className={styles.stack}><Card><CardHeader title="Turnover planning" subtitle="Create one durable task per confirmed stay and assign the field owner" action={<Action label="Generate missing tasks" disabled={!allowed} action={generateTurnoverTasks} onDone={onDone} icon={<RefreshCw size={16} />} />} /><p className={styles.text}>Tasks are idempotent: generating again preserves assignments and progress. Damage found at checkout is linked to the Shortlet maintenance register and blocks readiness until reviewed.</p></Card>{turnovers.length ? turnovers.map((task) => <TurnoverCard key={task.id} task={task} members={members} allowed={allowed} onDone={onDone} />) : <Card><EmptyState title="No turnover tasks" description="Generate tasks from confirmed and completed bookings." /></Card>}</div>;
}

function TurnoverCard({ task, members, allowed, onDone }: { task: Turnover; members: Member[]; allowed: boolean; onDone: (message: string) => void }) {
  const [assignee, setAssignee] = useState(task.assigneeId ?? members[0]?.id ?? '');
  const [status, setStatus] = useState(task.status);
  const [completed, setCompleted] = useState(() => new Set(task.checklist.filter((item) => item.done).map((item) => item.key)));
  const [pending, start] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => { const result = await action(); onDone(result.ok ? result.message ?? 'Turnover updated.' : result.error ?? 'Unable to update turnover.'); });
  return <Card padded={false}><div className={styles.header}><CardHeader title={`${task.apt} · ${task.ref}`} subtitle={`Due ${new Date(task.dueAtISO).toLocaleString('en-NG', { timeZone: 'Africa/Lagos', dateStyle: 'medium', timeStyle: 'short' })} WAT`} action={<StatusPill status={label(task.status)} tone={tone(task.status) as never} />} /></div><div className={styles.body}><div className={styles.formGrid}><label className={styles.field}>Assigned team member<select value={assignee} onChange={(event) => setAssignee(event.target.value)} disabled={!allowed || pending || !members.length} className="pb-form-control">{members.map((member) => <option key={member.id} value={member.id}>{member.name} · {label(member.role)}</option>)}</select></label><label className={styles.field}>Job status<select value={status} onChange={(event) => setStatus(event.target.value)} disabled={!allowed || pending} className="pb-form-control"><option value="scheduled">Scheduled</option><option value="assigned">Assigned</option><option value="in_progress">In progress</option><option value="ready_for_inspection">Ready for inspection</option><option value="ready">Ready</option><option value="blocked">Blocked</option></select></label></div><fieldset className={styles.stack + ' mt-6'}><legend className={styles.title}>Mobile turnover checklist</legend>{task.checklist.map((item) => <label key={item.key} className={styles.identity}><input type="checkbox" checked={completed.has(item.key)} disabled={!allowed || pending} onChange={(event) => setCompleted((previous) => { const next = new Set(previous); if (event.target.checked) next.add(item.key); else next.delete(item.key); return next; })} /> {item.label}</label>)}</fieldset>{task.maintenanceIssues ? <p className={styles.notice + ' mt-6'}>{task.maintenanceIssues} linked maintenance issue{task.maintenanceIssues === 1 ? '' : 's'} must be reviewed before guest-ready release.</p> : null}</div><div className={styles.footer}><div className={styles.actions}><Button onClick={() => run(() => assignTurnover(task.id, assignee))} disabled={!allowed || pending || !assignee}>Assign</Button><Button variant="primary" onClick={() => run(() => updateTurnover(task.id, { status: status as never, completedKeys: [...completed] }))} disabled={!allowed || pending}>Save progress</Button></div></div></Card>;
}

function Approvals({ approvals, allowed, onDone }: { approvals: Approval[]; allowed: boolean; onDone: (message: string) => void }) {
  return <Card padded={false}><div className={styles.header}><CardHeader title="Manager approval queue" subtitle="Identity, refunds and outbound guest messages" /></div>{approvals.length ? <ul className={styles.list}>{approvals.map((row) => <li key={row.id} className={styles.listRow}><div className={styles.listContent}><h3 className={styles.title}>{row.title}</h3><p className={styles.text}>{row.summary}</p><p className={styles.metadata}>{label(row.kind)} · {new Date(row.requestedAtISO).toLocaleString('en-NG', { timeZone: 'Africa/Lagos' })} WAT</p></div><StatusPill status={label(row.status)} tone={tone(row.status) as never} />{row.status === 'pending' ? <div className={styles.actions}><Action label="Approve" disabled={!allowed} action={() => decideShortletApproval(row.id, 'approved')} onDone={onDone} /><Action label="Reject" disabled={!allowed} action={() => decideShortletApproval(row.id, 'rejected')} onDone={onDone} danger /></div> : null}</li>)}</ul> : <div className={styles.empty}><EmptyState title="No approval records" description="New verification, refund and guest-message requests will appear here." /></div>}</Card>;
}

function Action({ label: text, action, onDone, disabled, danger, icon }: { label: string; action: () => Promise<{ ok: boolean; error?: string; message?: string }>; onDone: (message: string) => void; disabled?: boolean; danger?: boolean; icon?: React.ReactNode }) {
  const [pending, start] = useTransition();
  return <Button variant="secondary" className={danger ? 'text-negative' : undefined} icon={icon} disabled={disabled || pending} onClick={() => start(async () => { try { const result = await action(); onDone(result.ok ? result.message ?? `${text} completed.` : result.error ?? `${text} failed.`); } catch { onDone(`${text} could not be completed. Refresh before trying again.`); } })}>{pending ? 'Working…' : text}</Button>;
}

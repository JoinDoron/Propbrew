'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, Boxes, Check, Clock, Package, PackageCheck, PackagePlus, Search, X } from 'lucide-react';
import { Avatar, Button, Card, CardHeader, EmptyState, IconButton, KpiCard, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { toneVar, type Tone } from '@/lib/status-tones';
import { isParcelOverdue, type ParcelStatus, type LockerSize } from '@/domain/estate';
import { logParcel, collectParcel, notifyResident, type LogParcelInput } from '@/server/actions/estate';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from '@/components/security/safety-market.module.css';

export type LockerCell = { id: string; bank: string; label: string; size: LockerSize; occupied: boolean };
export type ParcelRow = { id: string; code: string; residentName: string; unitLabel: string; courier: string; size: LockerSize; status: ParcelStatus; lockerLabel?: string; receivedISO: string };
const STATUS_TONE: Record<ParcelStatus, Tone> = { received: 'info', stored: 'progress', collected: 'muted', overdue: 'danger' };
function ago(iso: string, nowMs: number) { const days = Math.max(0, Math.floor((nowMs - Date.parse(iso)) / 86400000)); return Number.isFinite(days) ? (days === 0 ? 'Today' : `${days}d ago`) : iso; }
function snapshotDate(nowMs: number) { return new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(nowMs); }

export function ParcelsWorkspace({ lockers, parcels, kpis, nowMs, canCreate = false, canMutate = false }: {
  lockers: LockerCell[]; parcels: ParcelRow[];
  kpis: { inLocker: number; awaiting: number; overdue: number; collectedToday: number; util: { used: number; total: number; pct: number } };
  nowMs: number; canCreate?: boolean; canMutate?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [showLog, setShowLog] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('active');
  const [confirmation, setConfirmation] = useState<{ parcel: ParcelRow; type: 'collect' | 'notify' } | null>(null);
  const banks = [...new Set(lockers.map((locker) => locker.bank))];
  const active = parcels.filter((parcel) => parcel.status !== 'collected');
  const collected = parcels.filter((parcel) => parcel.status === 'collected');
  const normalized = query.trim().toLowerCase();
  const visible = [...parcels].filter((parcel) => (filter === 'all' || (filter === 'active' ? parcel.status !== 'collected' : filter === 'overdue' ? isParcelOverdue(parcel, nowMs) : parcel.status === filter)) && `${parcel.code} ${parcel.residentName} ${parcel.unitLabel} ${parcel.courier} ${parcel.lockerLabel ?? ''}`.toLowerCase().includes(normalized)).sort((a, b) => Number(isParcelOverdue(b, nowMs)) - Number(isParcelOverdue(a, nowMs)) || Date.parse(a.receivedISO) - Date.parse(b.receivedISO));

  function confirmAction() {
    if (!canMutate || pending || !confirmation) return;
    setMessage(null);
    start(async () => {
      try {
        const result = await (confirmation.type === 'collect' ? collectParcel(confirmation.parcel.id) : notifyResident(confirmation.parcel.id));
        if (!result.ok) { setMessage(result.error ?? 'Unable to update this parcel.'); return; }
        setMessage(confirmation.type === 'collect' ? `Collection recorded for ${confirmation.parcel.code}.` : 'Reminder preview completed. No SMS, email or WhatsApp was sent.');
        setConfirmation(null);
        router.refresh();
      } catch { setMessage('Unable to complete this parcel action. Please try again.'); }
    });
  }

  return <div className={layout.layout}>
    <Card className={layout.panel}><div className={layout.context}><div className={styles.utilization}><Ring pct={kpis.util.pct} /><div><h2 className={layout.sectionTitle}>Parcel room</h2><p className={styles.body}>{kpis.inLocker} in lockers · {kpis.awaiting} at the desk</p><p className={styles.meta}>{kpis.util.used} of {kpis.util.total} lockers in use · Snapshot {snapshotDate(nowMs)}</p>{kpis.overdue > 0 && <p className={`${styles.meta} ${styles.danger}`}>{kpis.overdue} overdue for pickup</p>}</div></div>{canCreate && <Button variant="primary" icon={<PackagePlus size={16} />} onClick={() => { setMessage(null); setShowLog(true); }}>Log parcel</Button>}</div></Card>
    {message && !showLog && !confirmation && <ParcelFeedback message={message} onDismiss={() => setMessage(null)} />}
    <PageTabs label="Parcel and locker sections" items={[
      { id: 'register', label: 'Parcel register', content: <Card className={layout.panel}>
        <CardHeader title="Parcel register" subtitle="Locate a delivery, verify the recipient and record collection." action={<StatusPill status={`${active.length} awaiting collection`} tone={kpis.overdue ? 'warn' : 'info'} />} />
        <div className={`${layout.toolbar} mb-6`}><label className={layout.search}><Search size={18} aria-hidden="true" /><span className="sr-only">Search parcels</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search resident, courier or parcel…" /></label><label className={layout.field}><span className="sr-only">Parcel status</span><select className={layout.select} value={filter} onChange={(event) => setFilter(event.target.value)}><option value="active">Awaiting collection</option><option value="all">All parcels</option><option value="overdue">Overdue</option><option value="collected">Collected</option></select></label></div>
        {visible.length ? <div className="pb-table-scroll" role="region" aria-label="Parcel register" tabIndex={0}><table className={`pb-data-table ${layout.table}`}><caption className="sr-only">Delivery and collection records</caption><thead><tr>{['Resident / parcel', 'Courier / received', 'Location', 'Status', 'Actions'].map((heading) => <th key={heading} scope="col">{heading}</th>)}</tr></thead><tbody>{visible.map((parcel) => {
          const overdue = isParcelOverdue(parcel, nowMs);
          return <tr key={parcel.id}><td><div className={layout.person}><Avatar name={parcel.residentName} /><div><p className={layout.title}>{parcel.residentName}</p><p className={layout.metadata}>{parcel.unitLabel} · {parcel.code}</p></div></div></td><td><p>{parcel.courier}</p><p className={layout.metadata}>{ago(parcel.receivedISO, nowMs)}</p></td><td><p>{parcel.lockerLabel ?? 'At desk'}</p><p className={layout.metadata}>Size {parcel.size}</p></td><td><StatusPill status={overdue ? 'Overdue' : parcel.status} tone={STATUS_TONE[overdue ? 'overdue' : parcel.status]} /></td><td>{parcel.status !== 'collected' && canMutate ? <div className={layout.actions}><IconButton aria-label={`Preview reminder for ${parcel.code}`} onClick={() => { setMessage(null); setConfirmation({ parcel, type: 'notify' }); }} disabled={pending}><Bell size={16} /></IconButton><Button icon={<Check size={16} />} onClick={() => { setMessage(null); setConfirmation({ parcel, type: 'collect' }); }} disabled={pending} aria-label={`Record collection for ${parcel.code}`}>Collect</Button></div> : <span className={layout.metadata}>{parcel.status === 'collected' ? 'Collection recorded' : 'Read-only'}</span>}</td></tr>;
        })}</tbody></table></div> : <EmptyState icon={<Package size={24} />} title={parcels.length ? 'No parcels match this view' : 'No parcels recorded'} description={parcels.length ? 'Try another status or search term.' : 'Deliveries in your estate scope will appear here.'} />}
        <p className={`${styles.meta} mt-4`}>Showing {visible.length} of {parcels.length} records · {collected.length} collected in this snapshot.{!canMutate ? ' Read-only access: collection and reminder controls are unavailable.' : ''}</p>
      </Card> },
      { id: 'overview', label: 'Lockers & summary', content: <div className={layout.layout}>
        <div className={layout.metrics}><KpiCard label="In lockers" value={String(kpis.inLocker)} icon={<Package size={18} />} /><KpiCard label="Awaiting at desk" value={String(kpis.awaiting)} icon={<Boxes size={18} />} /><KpiCard label="Overdue pickup" value={String(kpis.overdue)} icon={<Clock size={18} />} iconColor={toneVar(kpis.overdue ? 'danger' : 'success')} /><KpiCard label="Collected on snapshot day" value={String(kpis.collectedToday)} icon={<PackageCheck size={18} />} /></div>
        <Card className={layout.panel}><CardHeader title="Locker banks" subtitle="Occupied lockers are indigo; availability is also written on every locker." action={<StatusPill status={`${kpis.util.used} / ${kpis.util.total} occupied`} tone="progress" />} />{banks.length ? <div className={layout.layout}>{banks.map((bank) => <section key={bank} aria-label={`${bank} locker bank`}><h3 className={layout.sectionTitle}>{bank}</h3><div className={styles.lockerBank}>{lockers.filter((locker) => locker.bank === bank).map((locker) => <div key={locker.id} className={`${styles.locker} ${locker.occupied ? styles.lockerOccupied : styles.lockerFree}`}><span>{locker.label}</span><span className={styles.meta}>{locker.size} · {locker.occupied ? 'Occupied' : 'Available'}</span></div>)}</div></section>)}</div> : <EmptyState icon={<Boxes size={24} />} title="No lockers configured" description="Parcels can be tracked at the desk while locker inventory is being set up." />}</Card>
      </div> },
    ]} />
    {canCreate && showLog && <LogDialog onClose={() => setShowLog(false)} onDone={(code) => { setShowLog(false); setMessage(`Parcel logged · ${code}. No notification was sent automatically.`); }} />}
    {canMutate && confirmation && <PortalDialog label={confirmation.type === 'collect' ? 'Record parcel collection' : 'Preview parcel reminder'} onClose={() => { setConfirmation(null); setMessage(null); }} canClose={!pending} width={480}><div className={layout.modal} aria-busy={pending}><div className={layout.dialogHeader}><h2 className={layout.dialogTitle}>{confirmation.type === 'collect' ? 'Record parcel collection' : 'Preview parcel reminder'}</h2><IconButton aria-label="Close parcel confirmation" disabled={pending} onClick={() => { setConfirmation(null); setMessage(null); }}><X size={18} /></IconButton></div><div className={layout.dialogBody}><div className={layout.person}><Avatar name={confirmation.parcel.residentName} /><div><p className={layout.title}>{confirmation.parcel.residentName}</p><p className={layout.metadata}>{confirmation.parcel.code} · {confirmation.parcel.unitLabel}</p></div></div><p className={styles.body}>{confirmation.type === 'collect' ? 'Verify the recipient and pickup code before marking this parcel as collected. This releases its assigned locker.' : 'Notification delivery is not connected. This action only previews the reminder workflow; it does not send SMS, email or WhatsApp.'}</p>{message && <ParcelFeedback message={message} onDismiss={() => setMessage(null)} />}</div><div className={styles.dialogFooter}><Button disabled={pending} onClick={() => { setConfirmation(null); setMessage(null); }}>Cancel</Button><Button variant="primary" disabled={pending} onClick={confirmAction}>{pending ? 'Recording…' : confirmation.type === 'collect' ? 'Confirm collection' : 'Complete preview'}</Button></div></div></PortalDialog>}
  </div>;
}

export function LogDialog({ onClose, onDone }: { onClose: () => void; onDone: (code: string) => void }) {
  const router = useRouter();
  const id = useId();
  const [pending, start] = useTransition();
  const [fields, setFields] = useState<LogParcelInput>({ residentName: '', unitLabel: '', courier: '', size: 'M' });
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof LogParcelInput, value: string) => setFields((current) => ({ ...current, [key]: value }));
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !fields.residentName.trim()) return;
    setError(null);
    start(async () => {
      try { const result = await logParcel(fields); if (!result.ok) { setError(result.error); return; } router.refresh(); onDone(result.ref ?? ''); }
      catch { setError('Unable to log this parcel. Please try again.'); }
    });
  }
  return <PortalDialog label="Log a parcel" onClose={onClose} canClose={!pending} width={520}><form className={layout.modal} onSubmit={submit} aria-busy={pending}><div className={layout.dialogHeader}><h2 className={layout.dialogTitle}>Log a parcel</h2><IconButton type="button" aria-label="Close parcel logging" disabled={pending} onClick={onClose}><X size={18} /></IconButton></div><div className={layout.dialogBody}><fieldset disabled={pending} className={styles.stack}><div className={layout.field}><label htmlFor={`${id}-resident`} className={layout.label}>Resident</label><input id={`${id}-resident`} name="residentName" value={fields.residentName} onChange={(event) => set('residentName', event.target.value)} className={layout.control} required maxLength={120} placeholder="e.g. Folake Bello" /></div><div className={styles.fields}><div className={layout.field}><label htmlFor={`${id}-unit`} className={layout.label}>Unit</label><input id={`${id}-unit`} name="unitLabel" value={fields.unitLabel} onChange={(event) => set('unitLabel', event.target.value)} className={layout.control} maxLength={120} placeholder="Block C · 12B" /></div><div className={layout.field}><label htmlFor={`${id}-courier`} className={layout.label}>Courier</label><input id={`${id}-courier`} name="courier" value={fields.courier} onChange={(event) => set('courier', event.target.value)} className={layout.control} maxLength={120} placeholder="Jumia" /></div></div><div className={layout.field}><label htmlFor={`${id}-size`} className={layout.label}>Parcel size</label><select id={`${id}-size`} name="size" value={fields.size} onChange={(event) => set('size', event.target.value)} className={layout.control}><option value="S">Small</option><option value="M">Medium</option><option value="L">Large</option></select></div></fieldset><p className={styles.meta}>An available locker is auto-assigned when possible; otherwise the parcel remains at the desk. A pickup reference is generated. No resident notification is sent automatically.</p>{error && <p className={`${styles.body} ${styles.danger}`} role="alert">{error}</p>}</div><div className={styles.dialogFooter}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending || !fields.residentName.trim()}>{pending ? 'Logging…' : 'Log & assign'}</Button></div></form></PortalDialog>;
}
function ParcelFeedback({ message, onDismiss }: { message: string; onDismiss: () => void }) { return <div role="status" className={layout.feedback}><span>{message}</span><IconButton aria-label="Dismiss parcel notification" onClick={onDismiss}><X size={16} /></IconButton></div>; }
function Ring({ pct }: { pct: number }) {
  const percent = Math.max(0, Math.min(100, Number.isFinite(pct) ? pct : 0));
  const color = toneVar(percent >= 80 ? 'danger' : percent >= 50 ? 'warn' : 'progress');
  return <div className={styles.ring} role="img" aria-label={`${percent}% of lockers occupied`}><svg width={64} height={64} viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r="15" fill="none" stroke="var(--border)" strokeWidth="3" /><circle cx="18" cy="18" r="15" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeDasharray={`${(percent / 100) * 94.2} 94.2`} /></svg><span className={styles.ringValue} style={{ color }}>{percent}%</span></div>;
}

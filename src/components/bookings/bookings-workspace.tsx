'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarCheck, Clock, Wallet, Gauge, AlertTriangle, ListChecks, Info, Search, X, CheckCircle2 } from 'lucide-react';
import { PageTabs } from '@/components/ui/page-tabs';
import { Avatar, Button, Card, CardHeader, EmptyState, IconButton, KpiCard, StatusPill } from '@/components/ui';
import { PortalDialog } from '@/components/portal/portal-dialog';
import { DomainStatus } from '@/components/domain';
import { toneVar } from '@/lib/status-tones';
import { transition } from '@/server/actions/transitions';
import type { InlineEvent } from '@/components/inline-actions';
import type { BookingStatus } from '@/domain/enums';
import type { CurrencyCode } from '@/domain/primitives';
import { utilisation, conflicts, wouldAutoApprove, usageHeatmap, amenityOf, AMENITIES, DAYS, BANDS, type BookingLike } from '@/domain/bookings';
import { EstateAmenitySetup, EstateAmenityBookingControl, type AmenityTarget, type AmenityResidentTarget } from './amenity-setup';
import { amenityApproval, amenitySlotAvailable, type EstateAmenity } from '@/domain/estate/amenities';
import layout from '@/components/ui/workspace-layout.module.css';
import styles from '@/components/estate/experience-workspaces.module.css';

export type BookingView = { id: string; amenityId?: string; endISO?: string; estateId?: string; amenity: string; residentName: string; status: BookingStatus; slot: string; feeMinor: number | null; feeCurrency?: CurrencyCode; actions: InlineEvent[] };
const RULE_LABEL: Record<string, string> = { always: 'Auto-approve', off_peak: 'Off-peak auto', manual: 'Manual approval' };
const money = (minor: number, currency: CurrencyCode = 'NGN') => new Intl.NumberFormat('en-NG', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(minor / 100);
function fmtSlot(iso: string) {
  if (!Number.isFinite(Date.parse(iso))) return iso;
  return `${new Date(iso).toLocaleString('en-NG', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })} WAT`;
}

export function BookingsWorkspace({ bookings, canMutate, amenities, sites = [], residents = [], expectedCompanyId = '' }: { bookings: BookingView[]; canMutate: boolean; amenities?: EstateAmenity[]; sites?: AmenityTarget[]; residents?: AmenityResidentTarget[]; expectedCompanyId?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amenity, setAmenity] = useState(AMENITIES[0].name);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [review, setReview] = useState<{ booking: BookingView; action: InlineEvent } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const lite: BookingLike[] = bookings.map((b) => ({ id: b.id, amenity: b.amenity, status: b.status, slot: b.slot, feeMinor: b.feeMinor }));
  const activeAmenities = amenities?.filter((row) => row.status === 'active');
  const util = amenities ? [] : utilisation(lite);
  const conf = amenities ? bookings.flatMap((row) => {
    const configured = amenities.find((item) => item.id === row.amenityId);
    if (!configured || !row.endISO || !['requested', 'approved', 'auto_approved', 'confirmed'].includes(row.status)) return [];
    const valid = amenitySlotAvailable(configured, row.slot, row.endISO, bookings.map((item) => ({ ...item, tenantId: configured.tenantId, estateId: item.estateId ?? '' })), row.id);
    return valid ? [] : [{ amenity: row.amenity, a: row.id, b: row.id, slot: row.slot }];
  }) : conflicts(lite);
  function approvalFor(row: BookingView) { const configured = amenities?.find((item) => item.id === row.amenityId); return configured ? amenityApproval(configured, row.slot) : amenities ? { auto: false, reason: 'Review this historical booking and its recorded terms.' } : wouldAutoApprove(row.amenity, row.slot); }
  const queue = bookings.filter((b) => b.status === 'requested');
  const heat = usageHeatmap(amenity);
  const avgUtil = util.length ? Math.round(util.reduce((n, u) => n + u.pct, 0) / util.length) : 0;
  const feeTotals = new Map<CurrencyCode, number>();
  for (const b of bookings) if (b.status === 'confirmed' || b.status === 'completed') { const c = b.feeCurrency ?? 'NGN'; feeTotals.set(c, (feeTotals.get(c) ?? 0) + (b.feeMinor ?? 0)); }
  const fees = feeTotals.size > 1 ? `${feeTotals.size} currencies` : feeTotals.size ? [...feeTotals].map(([c, n]) => money(n, c))[0] : money(0);
  const visible = bookings.filter((b) => (status === 'all' || b.status === status) && `${b.amenity} ${b.residentName} ${b.id}`.toLowerCase().includes(query.trim().toLowerCase()));
  function openReview(booking: BookingView, action: InlineEvent) { setError(null); setReview({ booking, action }); }
  function confirm() {
    if (!canMutate || !review || pending) return;
    setError(null); start(async () => {
      try {
        const r = await transition('booking', review.booking.id, review.action.event);
        if (!r.ok) { setError(r.error); return; }
        setFeedback(`${review.booking.amenity} · ${review.action.label} recorded.`); setReview(null); router.refresh();
      } catch { setError('The booking could not be updated. Please try again.'); }
    });
  }
  function actions(b: BookingView) {
    return canMutate && b.actions.length ? <div className={styles.actionRow}>{b.actions.map((a) => <Button key={a.event} variant={a.variant === 'primary' ? 'primary' : 'secondary'} disabled={pending} className={a.variant === 'danger' ? 'text-negative' : undefined} aria-label={`Review ${a.label.toLowerCase()} for ${b.residentName} at ${b.amenity}`} onClick={() => openReview(b, a)}>{a.label}</Button>)}</div> : <span className={layout.metadata}>{canMutate ? 'No actions available' : 'Read-only access'}</span>;
  }
  return <div className={layout.layout}>
    <div className={layout.context}><p className={layout.metadata}>Amenity booking snapshot · all slot times in WAT</p><StatusPill status={canMutate ? 'Manager controls' : 'Read-only access'} tone={canMutate ? 'info' : 'muted'} /></div>
    {amenities && <EstateAmenityBookingControl amenities={amenities} residents={residents} expectedCompanyId={expectedCompanyId} canManage={canMutate} />}
    {feedback && <div role="status" className={`${layout.feedback} ${styles.feedback}`}><CheckCircle2 size={18} /><span>{feedback}</span><IconButton aria-label="Dismiss booking update" onClick={() => setFeedback(null)}><X size={16} /></IconButton></div>}
    {conf.length > 0 && <div className={layout.notice}><AlertTriangle size={18} className="text-warning" aria-hidden="true" /><div><p className={layout.title}>{conf.length} potential scheduling conflict{conf.length === 1 ? '' : 's'}</p><p className={layout.body}>{[...new Set(conf.map((c) => c.amenity))].join(', ')} has overlapping two-hour booking windows. Review affected records before confirming.</p></div></div>}
    <PageTabs label="Amenity booking sections" items={[
      { id: 'overview', label: 'Overview', content: <div className={layout.layout}>
        <div className={layout.metrics}><KpiCard label="Booking records" value={String(bookings.length)} icon={<CalendarCheck size={18} />} /><KpiCard label="Awaiting approval" value={String(queue.length)} icon={<Clock size={18} />} /><KpiCard label="Confirmed & completed fees" value={fees} icon={<Wallet size={18} />} /><KpiCard label={amenities ? "Active amenities" : "Indicative utilisation"} value={amenities ? String(activeAmenities?.length ?? 0) : `${avgUtil}%`} icon={<Gauge size={18} />} /></div>
        <div className={layout.analytics}><Card><CardHeader title="Booking overview" subtitle="Current records, not a live availability feed." /><dl className={styles.facts}><div><dt>Amenities configured</dt><dd>{amenities ? activeAmenities?.length ?? 0 : AMENITIES.length}</dd></div><div><dt>Requested bookings</dt><dd>{queue.length}</dd></div><div><dt>Confirmed bookings</dt><dd>{bookings.filter((b) => b.status === 'confirmed').length}</dd></div><div><dt>Potential conflicts</dt><dd>{conf.length}</dd></div></dl></Card><Card><CardHeader title="Fee summary" subtitle="Recorded amounts, not proof of payment or settlement." />{feeTotals.size ? <dl className={styles.facts}>{[...feeTotals].map(([currency, minor]) => <div key={currency}><dt>{currency}</dt><dd>{money(minor, currency)}</dd></div>)}</dl> : <EmptyState icon={<Wallet size={24} />} title="No confirmed fees" description="Confirmed and completed booking amounts will appear here." />}<p className={layout.footnote}>Different currencies remain separate. No exchange rate or conversion is applied.</p></Card></div>
      </div> },
      ...(queue.length > 0 ? [{ id: 'approvals', label: 'Approval queue', count: queue.length, content: <div className={layout.layout}><Card padded={false}><div className={layout.registerHeader}><CardHeader title="Approval queue" subtitle="Rules are advisory. Review each booking and resolve conflicts before approval." action={<ListChecks size={20} className="text-primary" />} /></div><div className={styles.approvalList}>{queue.map((b) => { const rule = approvalFor(b); return <div key={b.id} className={styles.approval}><Avatar name={b.residentName} size={40} /><div className={styles.approvalIdentity}><div className={layout.title}>{b.amenity} · {b.residentName}</div><p className={layout.metadata}>{fmtSlot(b.slot)}</p><p className={layout.body}>{b.feeMinor === null ? 'No fee recorded' : b.feeMinor === 0 ? 'Free' : money(b.feeMinor, b.feeCurrency)}</p><div className={styles.rule}><Info size={16} /><span>{rule.auto ? 'Rule suggests approval' : 'Manager review required'} · {rule.reason}</span></div></div>{actions(b)}</div>; })}</div></Card></div> }] : []),
      ...(amenities ? [{ id: 'amenities', label: 'Amenities', count: activeAmenities?.length ?? 0, content: <EstateAmenitySetup amenities={amenities} sites={sites} expectedCompanyId={expectedCompanyId} canManage={canMutate} /> }] : []),
      { id: 'availability', label: 'Availability', content: amenities ? <div className={layout.layout}>
        <Card><CardHeader title="Recorded reservations" subtitle="Capacity and WAT opening hours are checked when saving a reservation. Requested slots also reserve capacity." />
        {activeAmenities?.length ? <dl className={styles.facts}>{activeAmenities.map((item) => <div key={item.id}><dt>{item.name}</dt><dd>{bookings.filter((row) => row.amenityId === item.id && ['requested', 'approved', 'auto_approved', 'confirmed'].includes(row.status)).length} active reservations · capacity {item.capacity}</dd></div>)}</dl> : <EmptyState icon={<CalendarCheck size={24} />} title="No reservable amenities" description="Configure an amenity before recording resident reservations." />}
        <p className={layout.footnote}>Review exact dates and intervals in the booking register. Existing reservations retain their saved terms.</p></Card>
      </div> : <div className={layout.layout}>
        <div className={layout.notice}><Info size={18} aria-hidden="true" /><p className={layout.body}>Illustrative demand only. The weekly grid is a deterministic demonstration, not availability calculated from booking records. Check the register before offering a slot.</p></div>
        <div className={layout.analytics}><Card className={layout.panel}><CardHeader title="Weekly demand illustration" subtitle="Sample demand bands for the selected amenity." action={<select className={layout.select} aria-label="Amenity demand illustration" value={amenity} onChange={(e) => setAmenity(e.target.value)}>{AMENITIES.map((a) => <option key={a.name}>{a.name}</option>)}</select>} /><div className="pb-table-scroll" role="region" aria-label={`Illustrative weekly demand for ${amenity}`} tabIndex={0}><table className={styles.heatmap}><caption className="sr-only">Illustrative demand, zero to four. Not live slot availability.</caption><thead><tr><th scope="col">Day</th>{BANDS.map((b) => <th key={b} scope="col">{b}</th>)}</tr></thead><tbody>{heat.map((row, d) => <tr key={DAYS[d]}><th scope="row">{DAYS[d]}</th>{row.map((v, t) => <td key={t} style={{ background: v === 0 ? 'var(--surface-3)' : `color-mix(in srgb, ${toneVar(v >= 3 ? 'warn' : 'progress')} ${12 + v * 9}%, var(--surface))` }} aria-label={`${DAYS[d]} ${BANDS[t]}: illustrative demand ${v} of 4`}>{v}</td>)}</tr>)}</tbody></table></div><div className={styles.heatmapLegend}><span>0 low demand</span><span>4 high demand</span><span>Capacity {amenityOf(amenity).capacity} · {RULE_LABEL[amenityOf(amenity).autoApprove]}</span></div></Card>
        <Card className={layout.panel}><CardHeader title="Indicative utilisation" subtitle="Demo-scaled against nominal weekly capacity; not a measured occupancy rate." /><div className={styles.utilList}>{util.map((u) => <button key={u.amenity} type="button" className={styles.utilButton} aria-pressed={amenity === u.amenity} onClick={() => setAmenity(u.amenity)}><div className={styles.demandLabel}><span>{u.amenity}</span><span>{u.pct}%</span></div><div className={styles.progress}><span style={{ width: `${u.pct}%`, background: toneVar(u.tone) }} /></div><div className={layout.metadata}>{u.bookings} active records · {RULE_LABEL[u.rule]}</div></button>)}</div></Card></div>
      </div> },
      { id: 'register', label: 'Booking register', content: <div className={layout.layout}><Card padded={false}><div className={layout.registerHeader}><CardHeader title="Booking register" subtitle="Review every booking, slot, status and available workflow action." /><div className={layout.toolbar}><label className={layout.search}><Search size={16} aria-hidden="true" /><input type="search" aria-label="Search bookings" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search amenities, residents or references" /></label><select className={layout.select} aria-label="Booking status" value={status} onChange={(e) => setStatus(e.target.value)}><option value="all">All statuses</option>{[...new Set(bookings.map((b) => b.status))].map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select></div></div>
        {visible.length ? <div className="pb-table-scroll" role="region" aria-label="Booking register" tabIndex={0}><table className={`pb-data-table ${layout.table} ${styles.bookingTable}`}><thead><tr>{['Amenity', 'Resident', 'Status', 'Slot', 'Fee', 'Actions'].map((h) => <th key={h} scope="col">{h}</th>)}</tr></thead><tbody>{visible.map((b) => <tr key={b.id}><td><div className={layout.title}>{b.amenity}</div><div className={layout.metadata}>{b.id}</div></td><td><div className={layout.person}><Avatar name={b.residentName} size={32} /><span>{b.residentName}</span></div></td><td><DomainStatus type="booking" status={b.status} /></td><td>{fmtSlot(b.slot)}</td><td className={styles.numeric}>{b.feeMinor === null ? 'Not recorded' : b.feeMinor === 0 ? 'Free' : money(b.feeMinor, b.feeCurrency)}</td><td>{actions(b)}</td></tr>)}</tbody></table></div> : <EmptyState icon={<CalendarCheck size={24} />} title={bookings.length ? 'No matching bookings' : 'No bookings yet'} description={bookings.length ? 'Try another search or status filter.' : 'Booking records in your scope will appear here.'} />}<div className={layout.registerFooter}>Showing {visible.length} of {bookings.length} booking records · Times in WAT</div>
      </Card></div> },
    ]} />
    <p className={layout.metadata}>Approval rules are advisory and available actions follow your role. Booking fees shown here do not prove collection, gateway payment or settlement.</p>
    {canMutate && review && <PortalDialog label="Review booking action" onClose={() => setReview(null)} canClose={!pending} width={540}><div className={layout.modal}><div className={layout.dialogHeader}><h2 className={layout.dialogTitle}>Review booking action</h2><IconButton aria-label="Close booking confirmation" disabled={pending} onClick={() => setReview(null)}><X size={18} /></IconButton></div><div className={layout.dialogBody}><p className={layout.body}>Confirm this workflow update after reviewing the booking and any scheduling conflicts. This does not initiate or verify a payment.</p><dl className={styles.facts}><div><dt>Amenity</dt><dd>{review.booking.amenity}</dd></div><div><dt>Resident</dt><dd>{review.booking.residentName}</dd></div><div><dt>Slot</dt><dd>{fmtSlot(review.booking.slot)}</dd></div><div><dt>Current status</dt><dd><DomainStatus type="booking" status={review.booking.status} /></dd></div><div><dt>Action</dt><dd>{review.action.label}</dd></div></dl>{error && <p role="alert" className={layout.feedback}>{error}</p>}<div className={layout.actions}><Button disabled={pending} onClick={() => setReview(null)}>Cancel</Button><Button variant="primary" disabled={pending} onClick={confirm}>{pending ? 'Saving…' : `Confirm ${review.action.label.toLowerCase()}`}</Button></div></div></div></PortalDialog>}
  </div>;
}

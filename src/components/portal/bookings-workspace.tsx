'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, Check, Clock, RotateCcw, X } from 'lucide-react';
import { Button, CardHeader, EmptyState, IconButton } from '@/components/ui';
import { PortalCard, portalMoney } from './portal-patterns';
import { PortalDialog } from './portal-dialog';
import { PageTabs } from '@/components/ui/page-tabs';
import { WorkspaceDecisionDialog, type WorkspaceDecision } from '@/components/ui/workspace-decision';
import { DomainStatus } from '@/components/domain';
import type { BookingStatus } from '@/domain/enums';
import type { InlineEvent } from '@/components/inline-actions';
import { AMENITIES, amenityOf, wouldAutoApprove } from '@/domain/bookings';
import { NOW } from '@/domain/ppm';
import { createBooking } from '@/server/actions/resident-bookings';
import { transition } from '@/server/actions/transitions';
import layout from '@/components/ui/workspace-layout.module.css';

export type BookingView = { id: string; amenity: string; status: BookingStatus; slot: string; feeMinor: number | null; feeCurrency?: string | null; actions: InlineEvent[] };
const HOURS = [8, 10, 12, 14, 16, 18];
const RULE_LABEL: Record<string, string> = { always: 'Instant', off_peak: 'Off-peak instant', manual: 'Needs approval' };
const PAST = ['completed', 'declined', 'cancelled'];
export const formatWatHour = (hour: number) => `${hour % 12 || 12}${hour >= 12 ? 'pm' : 'am'} WAT`;
export function bookingSlotWat(dayISO: string, hour: number): string { return new Date(`${dayISO}T${String(hour).padStart(2, '0')}:00:00+01:00`).toISOString(); }
const fmtSlot = (iso: string) => `${new Date(iso).toLocaleString('en-NG', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Lagos' })} WAT`;
function feeLabel(booking: BookingView) { return booking.feeMinor == null || booking.feeMinor === 0 ? 'No recorded fee' : booking.feeCurrency ? `${portalMoney(booking.feeMinor, booking.feeCurrency)} recorded fee` : 'Fee currency not recorded'; }

export function BookingsWorkspace({ bookings, canCreate = false, canTransition = false }: { bookings: BookingView[]; canCreate?: boolean; canTransition?: boolean }) {
  const router = useRouter();
  const [booking, setBooking] = useState(false);
  const [rebook, setRebook] = useState<string | null>(null);
  const [decision, setDecision] = useState<WorkspaceDecision | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const upcoming = bookings.filter((row) => !PAST.includes(row.status));
  const past = bookings.filter((row) => PAST.includes(row.status));
  function cancel(row: BookingView, event: string) {
    if (!canTransition) return;
    setDecision({ title: 'Cancel amenity booking', record: `${row.amenity} · ${fmtSlot(row.slot)}`, description: 'Review this booking before cancelling it. Cancellation changes the booking record; it does not verify or transfer a fee refund.', confirmLabel: 'Confirm cancellation', action: () => transition('booking', row.id, event), onSuccess: () => { router.refresh(); setMessage('Booking cancellation recorded. No payment or refund was performed here.'); } });
  }
  return <div className={layout.layout}>
    <div className={layout.toolbar}><p className={layout.body}>{upcoming.length} upcoming bookings</p><Button variant="primary" icon={<CalendarPlus size={18} />} disabled={!canCreate} onClick={() => { setRebook(null); setBooking(true); }}>Book an amenity</Button></div>
    <PageTabs label="My amenity booking sections" items={[
      { id: 'upcoming', label: 'Upcoming bookings', content: <div className={layout.layout}>{upcoming.length ? upcoming.map((row) => <PortalCard key={row.id}><CardHeader title={row.amenity} subtitle={fmtSlot(row.slot)} action={<DomainStatus type="booking" status={row.status} />} /><p className={layout.body}>{feeLabel(row)}</p><div className={`${layout.actions} mt-6`}>{row.actions.filter((action) => action.event === 'CANCEL').map((action) => <Button key={action.event} disabled={!canTransition} onClick={() => cancel(row, action.event)} className="text-negative">Cancel booking</Button>)}</div></PortalCard>) : <PortalCard><EmptyState title={past.length ? 'No upcoming bookings' : 'No bookings yet'} description="Reserve a shared amenity or review your previous bookings." /></PortalCard>}</div> },
      { id: 'past', label: 'Past bookings', content: <div className={layout.layout}>{past.length ? past.map((row) => <PortalCard key={row.id}><CardHeader title={row.amenity} subtitle={fmtSlot(row.slot)} action={<DomainStatus type="booking" status={row.status} />} /><div className={layout.toolbar}><p className={layout.body}>{feeLabel(row)}</p><Button icon={<RotateCcw size={16} />} disabled={!canCreate} onClick={() => { setRebook(row.amenity); setBooking(true); }}>Rebook</Button></div></PortalCard>) : <PortalCard><EmptyState title="No past bookings" description="Completed, declined and cancelled booking records appear here." /></PortalCard>}</div> },
    ]} />
    <p className={layout.metadata}>Fees are booking records, not proof of collection. Availability and automatic approval use the current rules; no real-time capacity guarantee or wallet debit is performed by this booking form.</p>
    {canCreate && booking && <BookDialog initialAmenity={rebook} onClose={() => setBooking(false)} onDone={(text) => { setBooking(false); setMessage(text); }} />}
    {decision && <WorkspaceDecisionDialog decision={decision} onClose={() => setDecision(null)} />}
    {message && <div className={layout.feedback} role="status"><span>{message}</span><IconButton aria-label="Dismiss booking message" onClick={() => setMessage(null)}><X size={18} /></IconButton></div>}
  </div>;
}

function BookDialog({ initialAmenity, onClose, onDone }: { initialAmenity: string | null; onClose: () => void; onDone: (message: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inFlight = useRef(false);
  const [amenity, setAmenity] = useState(initialAmenity ?? AMENITIES[0].name);
  const [dayIndex, setDayIndex] = useState(0);
  const [hour, setHour] = useState(16);
  const [error, setError] = useState<string | null>(null);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => { const date = new Date(`${NOW}T00:00:00Z`); date.setUTCDate(date.getUTCDate() + index + 1); return date.toISOString().slice(0, 10); }), []);
  const slotISO = bookingSlotWat(days[dayIndex], hour);
  const rule = wouldAutoApprove(amenity, slotISO);
  const selected = amenityOf(amenity);
  function submit() {
    if (inFlight.current) return;
    inFlight.current = true; setError(null);
    start(async () => {
      try { const result = await createBooking(amenity, slotISO); if (!result.ok) { setError(result.error); return; } router.refresh(); onDone(result.auto ? `${amenity} booking approved by the configured rule. No fee was collected.` : `${amenity} requested; manager approval is required. No fee was collected.`); }
      catch { setError('The booking could not be recorded. Please try again.'); }
      finally { inFlight.current = false; }
    });
  }
  return <PortalDialog label="Book an amenity" onClose={onClose} width={620} canClose={!pending}>
    <div className={layout.modal}><header className={layout.dialogHeader}><h2 className={layout.dialogTitle}>Book an amenity</h2><IconButton type="button" aria-label="Close dialog" disabled={pending} onClick={onClose}><X size={18} /></IconButton></header>
      <form className={layout.dialogBody} onSubmit={(event) => { event.preventDefault(); submit(); }}><fieldset disabled={pending} className="border-0 p-0 m-0 min-w-0 flex flex-col gap-6">
        <p className={layout.metadata}>Recorded demo snapshot: {NOW}. Choose a local WAT operating date below. This is not a live availability check.</p>
        <fieldset className="border-0 p-0 m-0"><legend className={`${layout.label} mb-3`}>Amenity</legend><div className="grid grid-cols-1 min-[480px]:grid-cols-2 gap-3">{AMENITIES.map((item) => <button key={item.name} type="button" aria-pressed={item.name === amenity} onClick={() => setAmenity(item.name)} className={`rounded-[10px] border p-4 text-left ${item.name === amenity ? 'border-primary bg-primary-weak' : 'border-border bg-surface'}`}><span className={layout.title}>{item.name}</span><span className={layout.metadata}>{item.feeMinor ? portalMoney(item.feeMinor) : 'No fee'} · {RULE_LABEL[item.autoApprove]}</span></button>)}</div></fieldset>
        <label className={layout.field}><span className={layout.label}>Day · WAT</span><select className={layout.control} value={dayIndex} onChange={(event) => setDayIndex(Number(event.target.value))}>{days.map((day, index) => <option key={day} value={index}>{new Date(`${day}T12:00:00+01:00`).toLocaleDateString('en-NG', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Africa/Lagos' })}</option>)}</select></label>
        <fieldset className="border-0 p-0 m-0"><legend className={`${layout.label} mb-3`}>Start time · WAT</legend><div className={layout.filters}>{HOURS.map((value) => <Button key={value} aria-pressed={value === hour} variant={value === hour ? 'primary' : 'secondary'} onClick={() => setHour(value)} type="button">{formatWatHour(value)}</Button>)}</div></fieldset>
        <div className={layout.notice}>{rule.auto ? <Check size={18} /> : <Clock size={18} />}<p>{rule.auto ? 'Rule-based approval' : 'Manager approval required'}<span>{rule.reason}. Selected: {fmtSlot(slotISO)}. Recorded fee: {selected.feeMinor ? portalMoney(selected.feeMinor) : 'No fee'}.</span></p></div>
        <p className={layout.body}>Confirming records this booking and its fee only. It does not collect a payment, debit your wallet or verify real-time availability.</p>
        {error && <p role="alert" className="text-sm text-negative">{error}</p>}
        <div className={layout.actions}><Button type="button" disabled={pending} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? 'Recording…' : rule.auto ? 'Confirm booking' : 'Request manager approval'}</Button></div>
      </fieldset></form>
    </div>
  </PortalDialog>;
}

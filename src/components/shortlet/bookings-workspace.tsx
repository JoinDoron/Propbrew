'use client';

import { PageTabs } from '@/components/ui/page-tabs';
import { shortletStyles, ShortletMetric, ShortletFeedback , ShortletDialog, ShortletConfirm, ShortletReview } from './reference-ui';
import { Button, CardHeader, EmptyState, StatusPill, Card } from '@/components/ui';
import styles from './shortlet-operations-polish.module.css';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Wallet, CalendarCheck, ShieldCheck, BedDouble, Link2, Receipt, Copy, Check, Wifi, KeyRound, Sparkles } from 'lucide-react';
import { statusTone, humanizeStatus, type Tone } from '@/lib/status-tones';
import { createBooking, advanceBooking, recordPayment } from '@/server/actions/shortlet';
import { shortletMoney as money } from './shortlet-format';

export type BookingRow = {
  id: string; ref: string; guest: string; phone: string; apt: string; property: string; propertyId: string;
  checkIn: string; checkOut: string; nights: number; source: string; status: string;
  totalMinor: number; paidMinor: number; outstandingMinor: number; nightlyMinor: number;
  cautionFeeMinor: number; cautionStatus: string; cautionDeductedMinor: number;
  wifiSsid: string; wifiPassword: string; access: string; houseRules: string[]; repeat: boolean;
  bank: { name: string; account: string; number: string };
  actions: { event: string; label: string }[];
};
export type AptOption = { id: string; name: string; property: string; rateMinor: number };

const SOURCE_LABEL: Record<string, string> = { direct: 'Direct', airbnb: 'Airbnb', booking_com: 'Booking.com', whatsapp: 'WhatsApp', agent: 'Agent' };
const fmtDate = (date: string) => new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }).format(new Date(date));
const fmtRange = (a: string, b: string) => `${fmtDate(a)} → ${fmtDate(b)}`;
const OPEN = ['enquiry', 'confirmed', 'checked_in'];

export function BookingsWorkspace({ bookings, apartments , canCreate = false, canUpdate = false}: { bookings: BookingRow[]; apartments: AptOption[] ; canCreate?: boolean; canUpdate?: boolean}) {
  const router = useRouter();
  const [tab, setTab] = useState<'all' | 'enquiry' | 'upcoming' | 'inhouse' | 'past'>('all');
  const [composing, setComposing] = useState(false);
  const [payFor, setPayFor] = useState<BookingRow | null>(null);
  const [linkFor, setLinkFor] = useState<BookingRow | null>(null);
  const [receiptFor, setReceiptFor] = useState<BookingRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (message: string) => setToast(message);


  const revenue = bookings.filter((b) => ['confirmed', 'checked_in', 'checked_out', 'closed'].includes(b.status)).reduce((n, b) => n + b.totalMinor, 0);
  const outstanding = bookings.filter((b) => OPEN.includes(b.status)).reduce((n, b) => n + b.outstandingMinor, 0);
  const cautionHeld = bookings.filter((b) => b.cautionStatus === 'held').reduce((n, b) => n + b.cautionFeeMinor, 0);
  const inhouse = bookings.filter((b) => b.status === 'checked_in').length;

  const shown = bookings.filter((b) => {
    if (tab === 'all') return true;
    if (tab === 'enquiry') return b.status === 'enquiry';
    if (tab === 'upcoming') return b.status === 'confirmed';
    if (tab === 'inhouse') return b.status === 'checked_in';
    return ['checked_out', 'closed', 'cancelled'].includes(b.status);
  });

  return (
    <div className={`pb-section ${shortletStyles.workspace}`}>

      <PageTabs label="Booking operations sections" items={[
        {
          id: "bookings", label: "Booking register", content: <div className={styles.stack}>
            <Card className={styles.section}>
            <CardHeader title="Booking register" subtitle="Recorded guest stays, exact NGN balances and the next operational action" />
            <div className={styles.toolbar}>
              <div className={styles.filters} role="group" aria-label="Filter bookings by status">
                {(['all', 'enquiry', 'upcoming', 'inhouse', 'past'] as const).map((t) => (
                  <Button type="button" key={t} aria-pressed={tab === t} onClick={() => setTab(t)} className="capitalize">{t === 'inhouse' ? 'In-house' : t}</Button>
                ))}
              </div>
              <Button variant="primary" icon={<Plus size={16} />} onClick={() => setComposing(true)} disabled={!canCreate}>New booking</Button>
            </div>
            </Card>
            {shown.length === 0 ? (
              <Card><EmptyState title="No bookings here" description="Recorded stays appear here when they match the selected status." icon={<CalendarCheck size={24} />} /></Card>
            ) : (
              <div className={styles.stack}>
                {shown.map((b) => (
                  <Card key={b.id} className={styles.section}>
                    <CardHeader title={b.guest} subtitle={`${b.ref} · ${b.apt} · ${b.property}`} action={<div className={styles.inline}><StatusPill status={humanizeStatus(b.status)} tone={statusTone('shortlet-booking', b.status) as Tone} />{b.repeat && <StatusPill status="Repeat guest" tone="warn" />}</div>} />
                    <dl className={styles.facts}>
                      <div><dt>Stay dates · WAT</dt><dd>{fmtRange(b.checkIn, b.checkOut)}</dd></div>
                      <div><dt>Length of stay</dt><dd>{b.nights} night{b.nights === 1 ? '' : 's'}</dd></div>
                      <div><dt>Booking source</dt><dd>{SOURCE_LABEL[b.source] ?? b.source}</dd></div>
                      <div><dt>Guest phone</dt><dd>{b.phone || 'Not recorded'}</dd></div>
                    </dl>
                    <dl className={styles.financialFacts}><div><dt>Booking total · NGN</dt><dd>{money(b.totalMinor)}</dd></div><div><dt>Paid · recorded</dt><dd>{money(b.paidMinor)}</dd></div><div><dt>Outstanding</dt><dd>{money(b.outstandingMinor)}</dd></div></dl>
                    <p className={styles.text}>Caution fee {money(b.cautionFeeMinor)} · {humanizeStatus(b.cautionStatus)}{b.cautionDeductedMinor > 0 ? ` · ${money(b.cautionDeductedMinor)} deduction recorded` : ''}</p>
                    <div className={styles.actions}>
                      {b.actions.map((a) => (
                        <ShortletConfirm key={a.event} title={`Review ${a.label.toLowerCase()}`} label={a.label} description={`${b.ref} · ${b.guest}. Change the booking from ${humanizeStatus(b.status)}. Cancellation may mark caution as refunded in the record only; no bank transfer is made.`} action={() => advanceBooking(b.id, a.event)} onDone={() => { router.refresh(); flash(`${a.label} recorded.`); }} danger={a.event === 'CANCEL'} />
                      ))}
                      {canUpdate && b.status === 'checked_out' && <Link href="/shortlet/inspections" className={styles.linkButton}><ShieldCheck size={16} /> Inspect & close</Link>}
                      {b.outstandingMinor > 0 && <Button disabled={!canUpdate} onClick={() => setPayFor(b)}>Record payment</Button>}
                      <Button onClick={() => setLinkFor(b)} icon={<Link2 size={16} />}>Guest link</Button>
                      <Button onClick={() => setReceiptFor(b)} icon={<Receipt size={16} />}>Receipt</Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        },
        {
          id: "summary", label: "Performance summary", content: <div className={styles.stack}>
            <div className={shortletStyles.metrics}>
              <Kpi label="Revenue" value={money(revenue)} tone="success" icon={<CalendarCheck size={16} />} />
              <Kpi label="Outstanding" value={money(outstanding)} tone={outstanding ? 'warn' : 'success'} icon={<Wallet size={16} />} />
              <Kpi label="Caution held" value={money(cautionHeld)} tone="progress" icon={<ShieldCheck size={16} />} />
              <Kpi label="In-house" value={String(inhouse)} tone="info" icon={<BedDouble size={16} />} />
            </div>
          </div>
        }
      ]} />

      {canCreate && composing && <NewBookingDialog apartments={apartments} onClose={() => setComposing(false)} onDone={(ref) => { setComposing(false); flash(`Booking ${ref} created.`); }} />}

      {canUpdate && payFor && <PaymentDialog booking={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); flash('Payment recorded.'); }} />}

      {linkFor && <GuestLinkModal booking={linkFor} onClose={() => setLinkFor(null)} onCopy={() => flash('Guest link copied')} />}

      {receiptFor && <ReceiptModal booking={receiptFor} onClose={() => setReceiptFor(null)} />}

      {toast && <ShortletFeedback message={toast} onClose={() => setToast(null)} />}

    </div>
  );
}

function Section({ n, title }: { n: number; title: string }) {
  return <div className={styles.sectionHeading}><span className={styles.sectionNumber}>{n}</span><h3 className={styles.title}>{title}</h3></div>;
}

function NewBookingDialog({ apartments, onClose, onDone }: { apartments: AptOption[]; onClose: () => void; onDone: (ref: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aptId, setAptId] = useState(apartments[0]?.id ?? '');
  const [guest, setGuest] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [ci, setCi] = useState(''); const [co, setCo] = useState('');
  const [source, setSource] = useState('direct'); const [agent, setAgent] = useState(''); const [status, setStatus] = useState('confirmed');
  const [caution, setCaution] = useState(''); const [requests, setRequests] = useState('');
  const [paid, setPaid] = useState(''); const [error, setError] = useState<string | null>(null);
  const apt = apartments.find((a) => a.id === aptId);
  const nights = ci && co && Date.parse(co) > Date.parse(ci) ? Math.round((Date.parse(co) - Date.parse(ci)) / 86400000) : 0;
  const total = (apt?.rateMinor ?? 0) * nights;
  const totalNaira = total / 100;
  const cautionN = caution === '' ? (apt?.rateMinor ?? 0) / 100 : Number(caution);
  const paidN = Number(paid || 0);
  const balance = Math.max(0, totalNaira - paidN);

  function submit() { if (pending) return;
    setError(null);
    start(async () => { try {
      const r = await createBooking({ apartmentId: aptId, guestName: guest, guestPhone: phone, guestEmail: email, checkIn: ci, checkOut: co, source: source as never, agentName: source === 'agent' ? agent : undefined, status, cautionNaira: cautionN, paidNaira: paidN, specialRequests: requests });
      if (!r.ok) { setError(r.error); return; }
      router.refresh(); onDone(r.ref ?? '');
     } catch { setError('Unable to save this record. Please try again.'); } });
  }
  return (
    <Modal title="Create a booking" onClose={onClose} pending={pending} wide>
      <Card className={styles.section}>
      <Section n={1} title="Guest details" />
      <div className={styles.formGrid}>
        <label className={`${styles.field} ${styles.wide}`}>Guest name *<input aria-label="Guest name *" value={guest} onChange={(e) => setGuest(e.target.value)} className={styles.control} placeholder="Full name" autoFocus /></label>
        <label className={styles.field}>Phone (WhatsApp)<input aria-label="Phone (WhatsApp)" value={phone} onChange={(e) => setPhone(e.target.value)} className={styles.control} placeholder="+234…" /></label>
        <label className={styles.field}>Email<input aria-label="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={styles.control} placeholder="guest@example.com" /></label>
      </div>
      </Card>

      <Card className={styles.section}>
      <Section n={2} title="Stay details" />
      <label className={styles.field}>Apartment *<select aria-label="Apartment *" value={aptId} onChange={(e) => setAptId(e.target.value)} className={styles.control}>{apartments.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.property} · {money(a.rateMinor)}/night</option>)}</select></label>
      <div className={styles.formGrid}>
        <label className={styles.field}>Check-in *<input aria-label="Check-in *" type="date" value={ci} onChange={(e) => setCi(e.target.value)} className={styles.control} /></label>
        <label className={styles.field}>Check-out *<input aria-label="Check-out *" type="date" value={co} onChange={(e) => setCo(e.target.value)} className={styles.control} /></label>
        <label className={styles.field}>Source<select aria-label="Source" value={source} onChange={(e) => setSource(e.target.value)} className={styles.control}>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {source === 'agent' ? <label className={styles.field}>Agent<input aria-label="Agent" value={agent} onChange={(e) => setAgent(e.target.value)} className={styles.control} placeholder="Agent name" /></label> : <label className={styles.field}>Status<select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)} className={styles.control}><option value="confirmed">Confirmed</option><option value="enquiry">Enquiry</option></select></label>}
      </div>
      <p className={styles.metadata}>Check-in and check-out are day-based WAT operating dates.</p>
      </Card>

      <Card className={styles.section}>
      <Section n={3} title="Payment" />
      <div className={styles.formGrid}>
        <div className={styles.field}><span>Total ({nights} nights)</span><output className={styles.control}>{money(total)}</output></div>
        <label className={styles.field}>Amount paid (₦)<input aria-label="Amount paid (₦)" value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className={styles.control} placeholder="0" /></label>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.inline}><Button type="button" onClick={() => setPaid(String(totalNaira))}>✓ Paid in full</Button><Button type="button" onClick={() => setPaid(String(Math.round(total / 2) / 100))}>½ Half paid</Button></div>
        <p className={styles.text}>Balance <strong>{money(Math.round(balance * 100))}</strong></p>
      </div>
      </Card>

      <Card className={styles.section}>
      <Section n={4} title="Extras & notes" />
      <div className={styles.formGrid}>
        <label className={styles.field}>Caution fee (₦) *<input aria-label="Caution fee (₦) *" value={caution} onChange={(e) => setCaution(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className={styles.control} placeholder={String((apt?.rateMinor ?? 0) / 100)} /></label>
      </div>
      <label className={styles.field}>Special requests<textarea aria-label="Special requests" value={requests} onChange={(e) => setRequests(e.target.value)} rows={2} placeholder="Early check-in, airport pickup, allergies…" className={styles.control} /></label>
      </Card>
      <p className={styles.notice}><Sparkles size={18} /> Booking details are recorded here. Public guest links, secure expiry and WhatsApp delivery are not verified by this demo.</p>
      {error && <div role="alert" className={styles.error}>{error}</div>}
      <Actions onClose={onClose} onSubmit={submit} pending={pending} disabled={!guest.trim() || !aptId || nights < 1 || paidN < 0 || paidN > totalNaira || cautionN < 0} label="Confirm booking" />
    </Modal>
  );
}

function PaymentDialog({ booking, onClose, onDone }: { booking: BookingRow; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amt, setAmt] = useState('');
  const [error, setError] = useState<string | null>(null);
  function submit() { if (pending) return;  setError(null); start(async () => { try { const r = await recordPayment(booking.id, Number(amt)); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone();  } catch { setError('Unable to save this record. Please try again.'); } }); }
  return (
    <Modal title="Record payment" onClose={onClose} pending={pending}>
      <Card><CardHeader title={booking.guest} subtitle={booking.ref} /><dl className={styles.facts}><div><dt>Booking total</dt><dd>{money(booking.totalMinor)}</dd></div><div><dt>Outstanding</dt><dd>{money(booking.outstandingMinor)}</dd></div></dl></Card>
      <label className={styles.field}>Amount received (₦)<input aria-label="Amount received (₦)" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" className={styles.control} autoFocus /></label>
      <p className={styles.notice}>Off-platform payment (bank transfer). This records what the guest has paid; it does not verify a bank settlement or charge the guest.</p>
      {error && <div role="alert" className={styles.error}>{error}</div>}
      <Actions onClose={onClose} onSubmit={submit} pending={pending} disabled={!amt || !Number.isFinite(Number(amt)) || Number(amt) <= 0 || Math.round(Number(amt) * 100) > booking.outstandingMinor} label="Confirm payment record" />
    </Modal>
  );
}

function GuestLinkModal({ booking: b, onClose, onCopy }: { booking: BookingRow; onClose: () => void; onCopy: () => void }) {
  const url = `https://stay.vesta.ng/g/${b.id.slice(-8)}`;
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  return (
    <Modal title="Guest check-in link" onClose={onClose} wide>
      <Card className={styles.section}>
        <CardHeader title={b.apt} subtitle={`${b.property} · ${fmtRange(b.checkIn, b.checkOut)} · WAT`} action={<StatusPill status="Preview only" tone="neutral" />} />
        <div className={styles.formGrid}>
          <Info icon={<Wifi size={18} />} label="WiFi" value={`${b.wifiSsid} · ${b.wifiPassword}`} />
          <Info icon={<KeyRound size={18} />} label="Access" value={b.access} />
        </div>
        <div className={styles.stack}><h3 className={styles.title}>House rules</h3>{b.houseRules.length ? <ul className={styles.rules}>{b.houseRules.map((r, index) => <li key={`${index}-${r}`}>{r}</li>)}</ul> : <p className={styles.text}>No house rules recorded.</p>}</div>
      </Card>
      <p className={styles.notice}><ShieldCheck size={18} /> Rates are never shown to guests in this preview. This sample URL is not a verified live, expiring link.</p>
      <div className={styles.toolbar}>
        <div className={styles.sampleUrl}>{url}</div>
        <Button variant="primary" icon={<Copy size={16} />} onClick={async () => { try { await navigator.clipboard.writeText(url); setCopyFeedback('Sample guest link copied. This is not a verified live link.'); onCopy(); } catch { setCopyFeedback('Copy unavailable. Select the sample URL manually.'); } }}>Copy</Button>
      </div>
      {copyFeedback && <p role="status" className="mt-4 text-sm text-text-3">{copyFeedback}</p>}
    </Modal>
  );
}

function ReceiptModal({ booking: b, onClose }: { booking: BookingRow; onClose: () => void }) {
  function download() {
    const lines = [`PROPBREW SHORTLET — RECORDED PAYMENT SUMMARY`, ``, `Ref: ${b.ref}`, `Guest: ${b.guest}`, `Apartment: ${b.apt}, ${b.property}`, `Stay: ${b.checkIn} → ${b.checkOut} (${b.nights} nights)`, ``, `${b.nights} nights × ${money(b.nightlyMinor)}   ${money(b.totalMinor)}`, `Caution fee (refundable)          ${money(b.cautionFeeMinor)}`, `Paid                              ${money(b.paidMinor)}`, `Outstanding                       ${money(b.outstandingMinor)}`, ``, b.outstandingMinor > 0 ? `Pay balance to: ${b.bank.name} · ${b.bank.account} · ${b.bank.number}` : `PAID IN FULL — thank you.`].join('\n');
    const url = URL.createObjectURL(new Blob([lines], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = `receipt-${b.ref}.txt`; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <Modal title="Booking receipt" onClose={onClose}>
      <Card>
        <CardHeader title={b.ref} subtitle={`${b.guest} · ${b.apt} · ${b.property}`} />
        <p className={styles.text}>{fmtRange(b.checkIn, b.checkOut)} · WAT</p>
        <Row label={`${b.nights} nights × ${money(b.nightlyMinor)}`} value={money(b.totalMinor)} />
        <Row label="Caution fee (refundable)" value={money(b.cautionFeeMinor)} />
        <Row label="Paid" value={money(b.paidMinor)} />
        <Row label="Outstanding" value={money(b.outstandingMinor)} bold />
        <Row label="Caution status" value={humanizeStatus(b.cautionStatus)} />
        {b.cautionDeductedMinor > 0 && <Row label="Caution deduction recorded" value={money(b.cautionDeductedMinor)} />}
        {b.outstandingMinor > 0 ? (
          <div className={styles.notice}><div><h3 className={styles.title}>Pay balance by transfer</h3><p>{b.bank.name} · {b.bank.account} · {b.bank.number}</p></div></div>
        ) : <div className={styles.inline}><Check size={18} className="text-positive" /><StatusPill status="Paid in full · recorded" tone="success" /></div>}
      </Card>
      <p className={styles.notice}>This is a recorded payment summary, not proof of a verified gateway payment or bank settlement.</p>
      <Button variant="primary" onClick={download} icon={<Receipt size={16} />}>Download receipt</Button>
    </Modal>
  );
}

/* --- shared bits ---------------------------------------------------------- */
function Modal({ title, onClose, children, wide, pending = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean; pending?: boolean }) {
  return (
    <ShortletDialog title={title} onClose={onClose} pending={pending} wide={wide}><div className={styles.stack}>{children}</div></ShortletDialog>
  );
}
function Actions({ onClose, onSubmit, pending, disabled, label }: { onClose: () => void; onSubmit: () => void; pending: boolean; disabled?: boolean; label: string }) {
  return <div className={styles.reviewBoundary}><ShortletReview pending={pending} disabled={disabled} onCancel={onClose} onSubmit={onSubmit} label={label}>Review the guest, dates and exact NGN amounts above. Payments and caution fees are manual records only; saving does not charge, verify or refund money.</ShortletReview></div>;
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className={`${styles.receiptRow} ${bold ? styles.receiptTotal : ''}`}><span>{label}</span><span>{value}</span></div>;
}
function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <Card className={styles.section}><div className={styles.inline}>{icon}<h3 className={styles.title}>{label}</h3></div><p className={styles.text}>{value || 'Not recorded'}</p></Card>;
}
function Kpi({ label, value, icon, tone }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) { return <ShortletMetric label={label} value={value} icon={icon} tone={tone} />; }

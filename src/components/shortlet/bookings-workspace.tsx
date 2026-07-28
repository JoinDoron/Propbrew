'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, X, Wallet, CalendarCheck, ShieldCheck, BedDouble, Link2, Receipt, Copy, Check, Wifi, KeyRound, Sparkles, Star } from 'lucide-react';
import { toneVar, statusTone, humanizeStatus, type Tone } from '@/lib/status-tones';
import { createBooking, advanceBooking, recordPayment } from '@/server/actions/shortlet';

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
const money = (m: number) => `₦${(m / 100).toLocaleString('en-NG')}`;
const fmtRange = (a: string, b: string) => `${a.slice(5)} → ${b.slice(5)}`;
const OPEN = ['enquiry', 'confirmed', 'checked_in'];

export function BookingsWorkspace({ bookings, apartments }: { bookings: BookingRow[]; apartments: AptOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tab, setTab] = useState<'all' | 'enquiry' | 'upcoming' | 'inhouse' | 'past'>('all');
  const [composing, setComposing] = useState(false);
  const [payFor, setPayFor] = useState<BookingRow | null>(null);
  const [linkFor, setLinkFor] = useState<BookingRow | null>(null);
  const [receiptFor, setReceiptFor] = useState<BookingRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3200); };

  const fire = (id: string, event: string, label: string) => start(async () => {
    const r = await advanceBooking(id, event);
    if (r.ok) { router.refresh(); flash(`${label} done.`); } else flash(r.error);
  });

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
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-2 min-[720px]:grid-cols-4 gap-2.5">
        <Kpi label="Revenue" value={money(revenue)} tone="success" icon={<CalendarCheck size={16} />} />
        <Kpi label="Outstanding" value={money(outstanding)} tone={outstanding ? 'warn' : 'success'} icon={<Wallet size={16} />} />
        <Kpi label="Caution held" value={money(cautionHeld)} tone="progress" icon={<ShieldCheck size={16} />} />
        <Kpi label="In-house" value={String(inhouse)} tone="info" icon={<BedDouble size={16} />} />
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'enquiry', 'upcoming', 'inhouse', 'past'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`h-8 px-3 rounded-full text-[12.5px] font-medium capitalize border ${tab === t ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 bg-surface text-text-2'}`}>{t === 'inhouse' ? 'In-house' : t}</button>
          ))}
        </div>
        <button onClick={() => setComposing(true)} className="ml-auto inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-white text-[13px] font-medium shadow-sm hover:brightness-105"><Plus size={16} /> New booking</button>
      </div>

      {shown.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-border rounded-2xl"><CalendarCheck size={24} className="mx-auto text-text-3 mb-2" /><p className="text-[13px] font-medium">No bookings here</p></div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {shown.map((b) => (
            <div key={b.id} className="bg-surface border border-border rounded-2xl shadow-card p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[14px] font-semibold truncate">{b.guest}</span>
                    {b.repeat && <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold text-warning"><Star size={9} className="fill-warning" /> REPEAT</span>}
                  </div>
                  <div className="text-[11.5px] text-text-3">{b.apt} · {b.property} · {fmtRange(b.checkIn, b.checkOut)} · {b.nights}n · {SOURCE_LABEL[b.source] ?? b.source}</div>
                </div>
                <div className="text-right flex-none">
                  <span className="text-[10.5px] font-semibold px-2 h-6 inline-flex items-center rounded-full capitalize" style={{ background: `color-mix(in srgb, ${toneVar(statusTone('shortlet-booking', b.status) as Tone)} 14%, transparent)`, color: toneVar(statusTone('shortlet-booking', b.status) as Tone) }}>{humanizeStatus(b.status)}</span>
                  <div className="text-[12px] font-mono mt-1">{money(b.totalMinor)}{b.outstandingMinor > 0 && <span className="text-warning"> · {money(b.outstandingMinor)} due</span>}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {b.actions.map((a) => (
                  <button key={a.event} disabled={pending} onClick={() => fire(b.id, a.event, a.label)} className={`text-[11.5px] px-2.5 h-7 rounded-lg font-medium disabled:opacity-50 ${a.event === 'CANCEL' ? 'text-negative border border-[color:var(--tone-danger)]/40' : 'bg-primary text-white'}`}>{a.label}</button>
                ))}
                {b.status === 'checked_out' && <Link href="/shortlet/inspections" className="text-[11.5px] px-2.5 h-7 rounded-lg font-medium bg-[color:var(--tone-warn)] text-white inline-flex items-center gap-1"><ShieldCheck size={12} /> Inspect & close</Link>}
                {b.outstandingMinor > 0 && <button disabled={pending} onClick={() => setPayFor(b)} className="text-[11.5px] px-2.5 h-7 rounded-lg font-medium border border-border-2 text-text-2">Record payment</button>}
                <button onClick={() => setLinkFor(b)} className="text-[11.5px] px-2.5 h-7 rounded-lg font-medium border border-border-2 text-text-2 inline-flex items-center gap-1"><Link2 size={12} /> Guest link</button>
                <button onClick={() => setReceiptFor(b)} className="text-[11.5px] px-2.5 h-7 rounded-lg font-medium border border-border-2 text-text-2 inline-flex items-center gap-1"><Receipt size={12} /> Receipt</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {composing && <NewBookingDialog apartments={apartments} onClose={() => setComposing(false)} onDone={(ref) => { setComposing(false); flash(`Booking ${ref} created.`); }} />}
      {payFor && <PaymentDialog booking={payFor} onClose={() => setPayFor(null)} onDone={() => { setPayFor(null); flash('Payment recorded.'); }} />}
      {linkFor && <GuestLinkModal booking={linkFor} onClose={() => setLinkFor(null)} onCopy={() => flash('Guest link copied')} />}
      {receiptFor && <ReceiptModal booking={receiptFor} onClose={() => setReceiptFor(null)} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function Section({ n, title }: { n: number; title: string }) {
  return <div className="flex items-center gap-2 mt-3 mb-1.5 first:mt-0"><span className="w-4 h-4 rounded-full bg-primary text-white text-[9px] font-bold grid place-items-center">{n}</span><span className="text-[10.5px] font-bold uppercase tracking-[0.06em] text-text-3">{title}</span></div>;
}

function NewBookingDialog({ apartments, onClose, onDone }: { apartments: AptOption[]; onClose: () => void; onDone: (ref: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aptId, setAptId] = useState(apartments[0]?.id ?? '');
  const [guest, setGuest] = useState(''); const [phone, setPhone] = useState(''); const [email, setEmail] = useState('');
  const [ci, setCi] = useState('2026-07-29'); const [co, setCo] = useState('2026-08-01');
  const [source, setSource] = useState('direct'); const [agent, setAgent] = useState(''); const [status, setStatus] = useState('confirmed');
  const [caution, setCaution] = useState(''); const [requests, setRequests] = useState('');
  const [paid, setPaid] = useState(''); const [error, setError] = useState<string | null>(null);
  const apt = apartments.find((a) => a.id === aptId);
  const nights = Math.max(1, Math.round((Date.parse(co) - Date.parse(ci)) / 86400000));
  const total = (apt?.rateMinor ?? 0) * nights;
  const totalNaira = Math.round(total / 100);
  const cautionN = caution === '' ? Math.round((apt?.rateMinor ?? 0) / 100) : Number(caution);
  const paidN = Number(paid || 0);
  const balance = Math.max(0, totalNaira - paidN);

  function submit() {
    setError(null);
    start(async () => {
      const r = await createBooking({ apartmentId: aptId, guestName: guest, guestPhone: phone, guestEmail: email, checkIn: ci, checkOut: co, source: source as never, agentName: source === 'agent' ? agent : undefined, status, cautionNaira: cautionN, paidNaira: paidN, specialRequests: requests });
      if (!r.ok) { setError(r.error); return; }
      router.refresh(); onDone(r.ref ?? '');
    });
  }
  return (
    <Modal title="Create a booking" onClose={onClose} wide>
      <Section n={1} title="Guest details" />
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2"><label className="lbl">Guest name *</label><input value={guest} onChange={(e) => setGuest(e.target.value)} className="inp" placeholder="Full name" autoFocus /></div>
        <div><label className="lbl">Phone (WhatsApp)</label><input value={phone} onChange={(e) => setPhone(e.target.value)} className="inp" placeholder="+234…" /></div>
        <div><label className="lbl">Email</label><input value={email} onChange={(e) => setEmail(e.target.value)} className="inp" placeholder="guest@example.com" /></div>
      </div>

      <Section n={2} title="Stay details" />
      <label className="lbl">Apartment *</label>
      <select value={aptId} onChange={(e) => setAptId(e.target.value)} className="inp mb-2">{apartments.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.property} · {money(a.rateMinor)}/night</option>)}</select>
      <div className="grid grid-cols-2 gap-2">
        <div><label className="lbl">Check-in *</label><input type="date" value={ci} onChange={(e) => setCi(e.target.value)} className="inp" /></div>
        <div><label className="lbl">Check-out *</label><input type="date" value={co} onChange={(e) => setCo(e.target.value)} className="inp" /></div>
        <div><label className="lbl">Source</label><select value={source} onChange={(e) => setSource(e.target.value)} className="inp">{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
        {source === 'agent' ? <div><label className="lbl">Agent</label><input value={agent} onChange={(e) => setAgent(e.target.value)} className="inp" placeholder="Agent name" /></div> : <div><label className="lbl">Status</label><select value={status} onChange={(e) => setStatus(e.target.value)} className="inp"><option value="confirmed">Confirmed</option><option value="enquiry">Enquiry</option></select></div>}
      </div>

      <Section n={3} title="Payment" />
      <div className="grid grid-cols-2 gap-2">
        <div><label className="lbl">Total ({nights}n)</label><div className="inp flex items-center font-mono font-semibold !bg-surface-2">{money(total)}</div></div>
        <div><label className="lbl">Amount paid (₦)</label><input value={paid} onChange={(e) => setPaid(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inp" placeholder="0" /></div>
      </div>
      <div className="flex gap-1.5 mt-1.5">
        <button type="button" onClick={() => setPaid(String(totalNaira))} className="text-[11px] px-2.5 h-7 rounded-lg border border-[color:var(--tone-success)]/40 text-positive">✓ Paid in full</button>
        <button type="button" onClick={() => setPaid(String(Math.round(totalNaira / 2)))} className="text-[11px] px-2.5 h-7 rounded-lg border border-[color:var(--tone-warn)]/40 text-warning">½ Half paid</button>
        <span className="ml-auto text-[11.5px] self-center">Balance <b className={balance ? 'text-warning' : 'text-positive'}>₦{balance.toLocaleString()}</b></span>
      </div>

      <Section n={4} title="Extras & notes" />
      <div className="grid grid-cols-2 gap-2">
        <div><label className="lbl">Caution fee (₦) *</label><input value={caution} onChange={(e) => setCaution(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inp" placeholder={String(Math.round((apt?.rateMinor ?? 0) / 100))} /></div>
      </div>
      <label className="lbl mt-2">Special requests</label>
      <textarea value={requests} onChange={(e) => setRequests(e.target.value)} rows={2} placeholder="Early check-in, airport pickup, allergies…" className="inp !h-auto py-2 resize-none" />
      <p className="text-[10.5px] text-text-3 mt-1.5 flex items-center gap-1"><Sparkles size={11} /> A personalised guest link + WhatsApp confirmation generate on confirm.</p>
      {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
      <Actions onClose={onClose} onSubmit={submit} pending={pending} disabled={!guest.trim()} label="Save booking" />
    </Modal>
  );
}

function PaymentDialog({ booking, onClose, onDone }: { booking: BookingRow; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amt, setAmt] = useState(String(Math.round(booking.outstandingMinor / 100)));
  const [error, setError] = useState<string | null>(null);
  function submit() { setError(null); start(async () => { const r = await recordPayment(booking.id, Number(amt)); if (!r.ok) { setError(r.error); return; } router.refresh(); onDone(); }); }
  return (
    <Modal title="Record payment" onClose={onClose}>
      <div className="rounded-xl bg-surface-2 p-3 mb-3 text-[12.5px]"><div className="font-semibold">{booking.guest} · {booking.ref}</div><div className="text-text-3">Outstanding {money(booking.outstandingMinor)} of {money(booking.totalMinor)}</div></div>
      <label className="lbl">Amount received (₦)</label>
      <input value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9]/g, ''))} inputMode="numeric" className="inp" autoFocus />
      <p className="text-[10.5px] text-text-3 mt-1.5">Off-platform payment (bank transfer). This records what the guest has paid (Assumption 2).</p>
      {error && <div className="text-[12px] text-negative mt-2">{error}</div>}
      <Actions onClose={onClose} onSubmit={submit} pending={pending} disabled={!amt} label="Record" />
    </Modal>
  );
}

function GuestLinkModal({ booking: b, onClose, onCopy }: { booking: BookingRow; onClose: () => void; onCopy: () => void }) {
  const url = `https://stay.vesta.ng/g/${b.id.slice(-8)}`;
  function hash(s: string) { let h = 0; for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0; return Math.abs(h); }
  return (
    <Modal title="Guest check-in link" onClose={onClose} wide>
      <div className="rounded-2xl border border-border p-4" style={{ background: 'linear-gradient(160deg, color-mix(in srgb, var(--primary) 8%, var(--surface)), var(--surface))' }}>
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-[11px] text-text-3">Welcome to</div><div className="text-[16px] font-bold">{b.apt}</div><div className="text-[12px] text-text-3">{b.property} · {fmtRange(b.checkIn, b.checkOut)}</div></div>
          <div className="w-16 h-16 rounded-lg bg-surface grid grid-cols-6 grid-rows-6 gap-px p-1 flex-none">{Array.from({ length: 36 }).map((_, i) => <span key={i} className="rounded-[0.5px]" style={{ background: (hash(b.id + i) & 1) ? 'var(--text)' : 'transparent' }} />)}</div>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-3">
          <Info icon={<Wifi size={13} />} label="WiFi" value={`${b.wifiSsid} · ${b.wifiPassword}`} />
          <Info icon={<KeyRound size={13} />} label="Access" value={b.access} />
        </div>
        <div className="mt-2.5"><div className="text-[10.5px] font-semibold text-text-3 uppercase">House rules</div><ul className="text-[11.5px] text-text-2 mt-1 list-disc pl-4">{b.houseRules.slice(0, 4).map((r) => <li key={r}>{r}</li>)}</ul></div>
      </div>
      <p className="text-[10.5px] text-text-3 mt-2 flex items-center gap-1"><ShieldCheck size={11} /> Rates are never shown to guests; the link is per-booking and expiring (FR-GL-04).</p>
      <div className="flex items-center gap-2 mt-2">
        <div className="flex-1 h-9 px-3 rounded-lg border border-border-2 bg-surface-2 text-[12px] font-mono text-text-3 flex items-center truncate">{url}</div>
        <button onClick={() => { navigator.clipboard?.writeText(url); onCopy(); }} className="h-9 px-3 rounded-lg bg-primary text-white text-[12.5px] font-medium inline-flex items-center gap-1.5"><Copy size={14} /> Copy</button>
      </div>
    </Modal>
  );
}

function ReceiptModal({ booking: b, onClose }: { booking: BookingRow; onClose: () => void }) {
  function download() {
    const lines = [`VESTA SHORT-LET — RECEIPT`, ``, `Ref: ${b.ref}`, `Guest: ${b.guest}`, `Apartment: ${b.apt}, ${b.property}`, `Stay: ${b.checkIn} → ${b.checkOut} (${b.nights} nights)`, ``, `${b.nights} nights × ${money(b.nightlyMinor)}   ${money(b.totalMinor)}`, `Caution fee (refundable)          ${money(b.cautionFeeMinor)}`, `Paid                              ${money(b.paidMinor)}`, `Outstanding                       ${money(b.outstandingMinor)}`, ``, b.outstandingMinor > 0 ? `Pay balance to: ${b.bank.name} · ${b.bank.account} · ${b.bank.number}` : `PAID IN FULL — thank you.`].join('\n');
    const url = URL.createObjectURL(new Blob([lines], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = `receipt-${b.ref}.txt`; a.click(); URL.revokeObjectURL(url);
  }
  return (
    <Modal title="Booking receipt" onClose={onClose}>
      <div className="rounded-xl border border-border p-4 text-[12.5px]">
        <div className="flex items-center justify-between"><span className="font-bold text-[14px]">{b.ref}</span><span className="text-text-3">{b.checkIn}</span></div>
        <div className="text-text-3 mt-0.5">{b.guest} · {b.apt}, {b.property}</div>
        <div className="border-t border-border my-2.5" />
        <Row label={`${b.nights} nights × ${money(b.nightlyMinor)}`} value={money(b.totalMinor)} />
        <Row label="Caution fee (refundable)" value={money(b.cautionFeeMinor)} />
        <Row label="Paid" value={money(b.paidMinor)} />
        <div className="border-t border-border my-2.5" />
        <Row label="Outstanding" value={money(b.outstandingMinor)} bold />
        {b.outstandingMinor > 0 ? (
          <div className="mt-3 rounded-lg bg-surface-2 p-2.5 text-[11.5px]"><div className="font-semibold">Pay balance by transfer</div><div className="text-text-3">{b.bank.name} · {b.bank.account} · {b.bank.number}</div></div>
        ) : <div className="mt-3 text-[12px] text-positive inline-flex items-center gap-1"><Check size={14} /> Paid in full</div>}
      </div>
      <button onClick={download} className="mt-3 w-full h-9 rounded-lg bg-primary text-white text-[13px] font-medium inline-flex items-center justify-center gap-1.5"><Receipt size={15} /> Download receipt</button>
    </Modal>
  );
}

/* --- shared bits ---------------------------------------------------------- */
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className={`relative w-full ${wide ? 'max-w-[460px]' : 'max-w-[380px]'} bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease] max-h-[90vh] overflow-y-auto`}>
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">{title}</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>
        {children}
      </div>
      <style>{`.lbl{display:block;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:var(--text-3);margin-bottom:4px}.inp{width:100%;height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--border-2);background:var(--surface);font-size:13px;outline:none}.inp:focus{border-color:var(--primary)}`}</style>
    </div>
  );
}
function Actions({ onClose, onSubmit, pending, disabled, label }: { onClose: () => void; onSubmit: () => void; pending: boolean; disabled?: boolean; label: string }) {
  return <div className="flex justify-end gap-2 mt-4"><button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button><button onClick={onSubmit} disabled={pending || disabled} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Saving…' : label}</button></div>;
}
function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return <div className={`flex items-center justify-between py-0.5 ${bold ? 'font-bold' : ''}`}><span className="text-text-2">{label}</span><span className="font-mono">{value}</span></div>;
}
function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="rounded-lg bg-surface p-2"><div className="text-[10px] text-text-3 uppercase flex items-center gap-1">{icon}{label}</div><div className="text-[11.5px] font-medium mt-0.5 break-words">{value}</div></div>;
}
function Kpi({ label, value, tone, icon }: { label: string; value: string; tone: Tone; icon: React.ReactNode }) {
  return <div className="bg-surface border border-border rounded-2xl shadow-card p-3.5"><span className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `color-mix(in srgb, ${toneVar(tone)} 14%, transparent)`, color: toneVar(tone) }}>{icon}</span><div className="text-[12px] text-text-2 font-medium mt-2.5">{label}</div><div className="text-[17px] font-bold tracking-[-0.02em] leading-none mt-1">{value}</div></div>;
}

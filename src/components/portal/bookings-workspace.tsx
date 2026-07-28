'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarPlus, X, Sparkles, Check, Clock, RotateCcw } from 'lucide-react';
import { formatMoney, DomainStatus } from '@/components/domain';
import { toneVar } from '@/lib/status-tones';
import type { BookingStatus } from '@/domain/enums';
import type { InlineEvent } from '@/components/inline-actions';
import { AMENITIES, amenityOf, wouldAutoApprove } from '@/domain/bookings';
import { NOW } from '@/domain/ppm';
import { createBooking } from '@/server/actions/resident-bookings';
import { transition } from '@/server/actions/transitions';

export type BookingView = { id: string; amenity: string; status: BookingStatus; slot: string; feeMinor: number | null; actions: InlineEvent[] };

const HOURS = [8, 10, 12, 14, 16, 18];
const RULE_LABEL: Record<string, string> = { always: 'Instant', off_peak: 'Off-peak instant', manual: 'Needs approval' };
const PAST = ['completed', 'declined', 'cancelled'];

function addDays(iso: string, n: number): Date {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
const money = (m: number) => formatMoney({ minor: m, currency: 'NGN' } as Parameters<typeof formatMoney>[0]);
const fmtSlot = (iso: string) => new Date(iso).toLocaleString('en-NG', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

export function BookingsWorkspace({ bookings }: { bookings: BookingView[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [booking, setBooking] = useState(false);
  const [rebook, setRebook] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const fire = (id: string, event: string) => start(async () => { await transition('booking', id, event); router.refresh(); });

  const upcoming = bookings.filter((b) => !PAST.includes(b.status));
  const past = bookings.filter((b) => PAST.includes(b.status));

  return (
    <div className="flex flex-col gap-3.5">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold">My bookings</h2>
          <p className="text-[12px] text-text-3">{upcoming.length} upcoming</p>
        </div>
        <button onClick={() => { setRebook(null); setBooking(true); }} className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl bg-primary text-white text-[13px] font-medium shadow-sm hover:brightness-105"><CalendarPlus size={16} /> Book an amenity</button>
      </div>

      {upcoming.length === 0 && past.length === 0 && (
        <div className="text-center py-14 border border-dashed border-border rounded-2xl">
          <CalendarPlus size={26} className="mx-auto text-text-3 mb-2" />
          <p className="text-[13.5px] font-medium">No bookings yet</p>
          <p className="text-[12px] text-text-3 mt-0.5">Reserve the clubhouse, pool, gym and more.</p>
        </div>
      )}

      {upcoming.length > 0 && (
        <div className="flex flex-col gap-2.5">
          {upcoming.map((b) => (
            <div key={b.id} className="bg-surface border border-border rounded-2xl shadow-card p-4 flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary-weak text-primary grid place-items-center flex-none font-bold text-[15px]">{b.amenity[0]}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold truncate">{b.amenity}</div>
                <div className="text-[11.5px] text-text-3">{fmtSlot(b.slot)}{b.feeMinor ? ` · ${money(b.feeMinor)}` : ' · free'}</div>
              </div>
              <div className="flex items-center gap-2">
                <DomainStatus type="booking" status={b.status} />
                {b.actions.filter((a) => a.event === 'CANCEL').map((a) => (
                  <button key={a.event} disabled={pending} onClick={() => fire(b.id, a.event)} className="text-[11.5px] px-2.5 h-7 rounded-lg font-medium text-negative border border-[color:var(--tone-danger)]/40 disabled:opacity-50">Cancel</button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-wide text-text-3 mb-2 mt-1">Past</div>
          <div className="flex flex-col gap-2">
            {past.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border">
                <div className="min-w-0 flex-1"><div className="text-[13px] font-medium truncate">{b.amenity}</div><div className="text-[11px] text-text-3">{fmtSlot(b.slot)}</div></div>
                <DomainStatus type="booking" status={b.status} />
                <button onClick={() => { setRebook(b.amenity); setBooking(true); }} className="text-[11.5px] text-primary hover:underline inline-flex items-center gap-1"><RotateCcw size={12} /> Rebook</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {booking && <BookDialog initialAmenity={rebook} onClose={() => setBooking(false)} onDone={(msg) => { setBooking(false); flash(msg); }} />}
      {toast && <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[90] bg-text text-surface text-[13px] font-medium px-4 py-2.5 rounded-xl shadow-float animate-fade">{toast}</div>}
    </div>
  );
}

function BookDialog({ initialAmenity, onClose, onDone }: { initialAmenity: string | null; onClose: () => void; onDone: (msg: string) => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amenity, setAmenity] = useState(initialAmenity ?? AMENITIES[0].name);
  const [dayIdx, setDayIdx] = useState(1);
  const [hour, setHour] = useState(16);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(NOW, i + 1)), []);
  const slotISO = useMemo(() => {
    const d = days[dayIdx];
    return `${d.toISOString().slice(0, 10)}T${String(hour).padStart(2, '0')}:00:00Z`;
  }, [days, dayIdx, hour]);
  const rule = wouldAutoApprove(amenity, slotISO);
  const a = amenityOf(amenity);

  function submit() {
    setError(null);
    start(async () => {
      const r = await createBooking(amenity, slotISO);
      if (!r.ok) { setError(r.error); return; }
      router.refresh();
      onDone(r.auto ? `Booked! ${amenity} confirmed instantly.` : `Requested — ${amenity} is awaiting approval.`);
    });
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center p-3 sm:p-4">
      <div className="absolute inset-0 bg-[rgba(10,12,20,.45)] animate-fade" onClick={onClose} />
      <div className="relative w-full max-w-[460px] bg-surface border border-border rounded-2xl shadow-float p-4 animate-[tms-slideup_.2s_ease] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-3"><h3 className="text-[15px] font-semibold">Book an amenity</h3><button onClick={onClose} className="w-8 h-8 rounded-lg grid place-items-center hover:bg-surface-2"><X size={17} /></button></div>

        {/* Amenity */}
        <div className="grid grid-cols-2 gap-2">
          {AMENITIES.map((am) => {
            const on = am.name === amenity;
            return (
              <button key={am.name} onClick={() => setAmenity(am.name)} className={`text-left rounded-xl border p-2.5 transition-colors ${on ? 'border-primary bg-primary-weak' : 'border-border-2 hover:bg-surface-2'}`}>
                <div className="text-[12.5px] font-semibold truncate">{am.name}</div>
                <div className="text-[10.5px] text-text-3">{am.feeMinor ? money(am.feeMinor) : 'Free'} · {RULE_LABEL[am.autoApprove]}</div>
              </button>
            );
          })}
        </div>

        {/* Day */}
        <div className="text-[11px] font-semibold text-text-3 uppercase tracking-wide mt-3.5 mb-1.5">Day</div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {days.map((d, i) => (
            <button key={i} onClick={() => setDayIdx(i)} className={`flex-none w-12 py-1.5 rounded-lg border text-center ${dayIdx === i ? 'border-primary bg-primary-weak text-primary' : 'border-border-2 text-text-2'}`}>
              <div className="text-[9.5px] uppercase">{d.toLocaleDateString('en-NG', { weekday: 'short' })}</div>
              <div className="text-[14px] font-bold leading-tight">{d.getUTCDate()}</div>
            </button>
          ))}
        </div>

        {/* Time */}
        <div className="text-[11px] font-semibold text-text-3 uppercase tracking-wide mt-3 mb-1.5">Time</div>
        <div className="flex flex-wrap gap-1.5">
          {HOURS.map((h) => (
            <button key={h} onClick={() => setHour(h)} className={`px-2.5 h-8 rounded-lg border text-[12px] ${hour === h ? 'border-primary bg-primary-weak text-primary font-medium' : 'border-border-2 text-text-2'}`}>{h > 12 ? `${h - 12}pm` : `${h}am`}</button>
          ))}
        </div>

        {/* Rule hint */}
        <div className="mt-3.5 rounded-xl border p-3 flex items-center gap-2" style={{ borderColor: `color-mix(in srgb, ${toneVar(rule.auto ? 'success' : 'warn')} 35%, transparent)`, background: `color-mix(in srgb, ${toneVar(rule.auto ? 'success' : 'warn')} 6%, transparent)` }}>
          {rule.auto ? <Check size={16} style={{ color: toneVar('success') }} /> : <Clock size={16} style={{ color: toneVar('warn') }} />}
          <div className="text-[12px]"><span className="font-semibold">{rule.auto ? 'Instant confirmation' : 'Needs manager approval'}</span> · {rule.reason}</div>
          {a.feeMinor > 0 && <span className="ml-auto text-[12px] font-semibold">{money(a.feeMinor)}</span>}
        </div>
        <p className="text-[10.5px] text-text-3 mt-1.5 flex items-center gap-1"><Sparkles size={11} /> Fee, if any, clears from your unit wallet (SC-02) on confirmation.</p>
        {error && <div className="text-[12px] text-negative mt-2">{error}</div>}

        <div className="flex justify-end gap-2 mt-3.5">
          <button onClick={onClose} className="h-9 px-3.5 rounded-lg border border-border-2 text-[13px]">Cancel</button>
          <button onClick={submit} disabled={pending} className="h-9 px-4 rounded-lg bg-primary text-white text-[13px] font-medium disabled:opacity-50">{pending ? 'Booking…' : rule.auto ? 'Book now' : 'Request booking'}</button>
        </div>
      </div>
    </div>
  );
}

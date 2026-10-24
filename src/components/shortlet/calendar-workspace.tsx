'use client';

import { Button, Card, CardHeader, EmptyState, IconButton, StatusPill } from '@/components/ui';
import { PageTabs } from '@/components/ui/page-tabs';
import { shortletStyles } from './reference-ui';
import styles from './shortlet-operations-polish.module.css';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Download, AlertTriangle } from 'lucide-react';
import { statusTone, humanizeStatus, toneVar, type Tone } from '@/lib/status-tones';
import { calendarBars, turnovers } from '@/domain/shortlet';
import type { SlBookingStatus, BookingSource } from '@/domain/shortlet/types';

export type CalBooking = { id: string; apartmentId: string; ref: string; guestName: string; status: SlBookingStatus; checkIn: string; checkOut: string; source: BookingSource };
export type CalApt = { id: string; name: string; property: string };

const DAY = 24 * 3600 * 1000;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const VIEWS: { key: string; label: string; days: number }[] = [{ key: 'week', label: 'Week', days: 7 }, { key: 'two', label: '2 weeks', days: 14 }, { key: 'month', label: 'Month', days: 30 }];
const LEGEND: { status: SlBookingStatus; label: string }[] = [
  { status: 'enquiry', label: 'Enquiry' }, { status: 'confirmed', label: 'Confirmed' }, { status: 'checked_in', label: 'Checked-in' }, { status: 'checked_out', label: 'Checked-out' }, { status: 'closed', label: 'Closed' },
];
const fmt = (ms: number) => new Intl.DateTimeFormat('en-NG', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Lagos' }).format(new Date(ms));

export function CalendarWorkspace({ apartments, bookings, nowMs }: { apartments: CalApt[]; bookings: CalBooking[]; nowMs: number }) {
  const [days, setDays] = useState(14);
  const [start, setStart] = useState(nowMs);
  const [aptFilter, setAptFilter] = useState('all');

  const shownApts = aptFilter === 'all' ? apartments : apartments.filter((a) => a.id === aptFilter);
  const flips = useMemo(() => new Set(turnovers(bookings, start, days).filter((t) => t.sameDay).map((t) => t.apartmentId)), [bookings, start, days]);
  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => new Date(start + i * DAY)), [start, days]);
  const visibleBookingIds = new Set(shownApts.flatMap((a) => calendarBars(bookings, a.id, start, days).map((b) => b.bookingId)));
  const visibleBookings = bookings.filter((b) => visibleBookingIds.has(b.id));
  const apartmentNames = new Map(apartments.map((a) => [a.id, `${a.name} · ${a.property}`]));

  function exportIcs() {
    const dstamp = (iso: string) => iso.replace(/-/g, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Propbrew Shortlet//EN', 'CALSCALE:GREGORIAN'];
    const aptName = new Map(apartments.map((a) => [a.id, a.name]));
    for (const b of bookings) {
      if (b.status === 'cancelled') continue;
      lines.push('BEGIN:VEVENT', `UID:${b.id}@vesta.ng`, `DTSTART;VALUE=DATE:${dstamp(b.checkIn)}`, `DTEND;VALUE=DATE:${dstamp(b.checkOut)}`, `SUMMARY:${b.guestName} — ${aptName.get(b.apartmentId) ?? ''}`, 'STATUS:CONFIRMED', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
    const a = document.createElement('a'); a.href = url; a.download = 'shortlet-calendar.ics'; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <div className={`pb-section ${shortletStyles.workspace}`}>

      {apartments.length === 0 && <Card><EmptyState title="No apartments in this calendar" description="Recorded stays appear when scoped apartments are available." /></Card>}
      <PageTabs label="Booking calendar sections" items={[
        {
          id: "calendar", label: "Availability calendar", content: <div className={styles.stack}>
            <Card className={styles.section}>
            <CardHeader title="Availability calendar" subtitle="Recorded stays and same-day turnovers · WAT operating dates" />
            <div className={styles.toolbar}>
              <div className={styles.inline}>
              <IconButton aria-label="Previous calendar period" onClick={() => setStart((s) => s - days * DAY)}><ChevronLeft size={18} /></IconButton>
              <Button onClick={() => setStart(nowMs)}>Snapshot date</Button>
              <IconButton aria-label="Next calendar period" onClick={() => setStart((s) => s + days * DAY)}><ChevronRight size={18} /></IconButton>
              <span className={styles.text}>{fmt(start)} – {fmt(start + (days - 1) * DAY)}</span>
              </div>
              <div className={styles.inline}>
                <div className={styles.filters} role="group" aria-label="Calendar period length">
                  {VIEWS.map((v) => <Button key={v.key} aria-pressed={days === v.days} onClick={() => setDays(v.days)}>{v.label}</Button>)}
                </div>
                <select value={aptFilter} aria-label="Filter calendar by apartment" onChange={(e) => setAptFilter(e.target.value)} className={styles.control}><option value="all">All apartments</option>{apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                <Button onClick={exportIcs} icon={<Download size={16} />} title="Export all recorded non-cancelled bookings, across all apartments">Export .ics</Button>
              </div>
            </div>
            </Card>
            <Card padded={false} className="overflow-hidden">
              <div className={styles.scroll} role="region" aria-label="Apartment booking calendar, horizontally scrollable" tabIndex={0}>
                <div style={{ minWidth: Math.max(720, 150 + days * 44) }} className={styles.calendar}>
                  <div className={styles.calendarHeading} style={{ gridTemplateColumns: `150px repeat(${days}, 1fr)` }}>
                    <span className={styles.metadata}>Apartment</span>
                    {dayList.map((d, i) => {
                      const today = d.getUTCFullYear() === new Date(nowMs).getUTCFullYear() && d.toISOString().slice(0, 10) === new Date(nowMs).toISOString().slice(0, 10);
                      const wknd = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                      return <span key={i} className={styles.calendarDay} style={today ? { color: 'var(--primary)', fontWeight: 500 } : wknd ? { color: 'var(--text-2)' } : undefined}>{WD[d.getUTCDay()]}<br />{d.getUTCDate()}</span>;
                    })}
                  </div>
                  {shownApts.map((a) => {
                    const cells: (null | { guest: string; tone: Tone; span: number; ref: string })[] = Array(days).fill(null);
                    for (const b of calendarBars(bookings, a.id, start, days)) if (cells[b.startCol] === null) cells[b.startCol] = { guest: b.guestName, tone: statusTone('shortlet-booking', b.status) as Tone, span: Math.min(b.span, days - b.startCol), ref: b.ref };
                    return (
                      <div key={a.id} className={styles.calendarRow} style={{ gridTemplateColumns: `150px repeat(${days}, 1fr)` }}>
                        <div className={styles.apartment}>
                          {flips.has(a.id) && <AlertTriangle size={16} className="text-negative" aria-label="Same-day turnover" />}
                          <div><p className={styles.text}>{a.name}</p><p className={styles.metadata}>{a.property}</p></div>
                        </div>
                        {renderRow(cells)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </Card>
            <Card padded={false} className="overflow-hidden">
              <div className={styles.header}><CardHeader title="Stays in this period" subtitle="Complete recorded stays, including overlapping bookings that share a calendar cell" /></div>
              <div className={styles.scroll} role="region" aria-label="Recorded stays in the calendar period" tabIndex={0}>
                <table className={styles.table}><thead><tr>{['Booking', 'Guest', 'Apartment', 'Check-in · WAT', 'Check-out · WAT', 'Status', 'Source', 'Action'].map((heading) => <th scope="col" key={heading}>{heading}</th>)}</tr></thead><tbody>
                  {visibleBookings.map((booking) => <tr key={booking.id}><td>{booking.ref}</td><td>{booking.guestName}</td><td>{apartmentNames.get(booking.apartmentId) ?? booking.apartmentId}</td><td>{fmt(Date.parse(booking.checkIn))}</td><td>{fmt(Date.parse(booking.checkOut))}</td><td><StatusPill status={humanizeStatus(booking.status)} tone={statusTone('shortlet-booking', booking.status) as Tone} /></td><td>{humanizeStatus(booking.source)}</td><td><Link href="/shortlet/bookings" className={styles.linkButton} aria-label={`View booking ${booking.ref}`}>View booking</Link></td></tr>)}
                  {visibleBookings.length === 0 && <tr><td colSpan={8}><EmptyState title="No recorded stays in this period" description="Change the period or apartment filter to review other recorded bookings." /></td></tr>}
                </tbody></table>
              </div>
            </Card>
          </div>
        },
        {
          id: "legend", label: "Status guide", content: <div className={styles.stack}>
            <Card className={styles.section}><CardHeader title="Booking status guide" subtitle="Use recorded statuses and turnover signals to plan the next stay." /><div className={styles.inline}>
              {LEGEND.map((l) => <StatusPill key={l.status} status={humanizeStatus(l.label)} tone={statusTone('shortlet-booking', l.status) as Tone} />)}
              <span className={`${styles.inline} ${styles.text}`}><AlertTriangle size={18} className="text-negative" /> Same-day turnover</span>
            </div><p className={styles.notice}>Availability reflects recorded bookings, not a live channel check. Confirm externally before accepting a stay. The reference date is {fmt(nowMs)}; day-based stays use local WAT operating dates.</p></Card>
          </div>
        }
      ]} />

    </div>
  );
}

function renderRow(cells: (null | { guest: string; tone: Tone; span: number; ref: string })[]) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c === null) { out.push(<div key={i} className={styles.calendarBlank} />); continue; }
    out.push(
      <Link key={i} href="/shortlet/bookings" className={styles.calendarBar} style={{ gridColumn: `span ${c.span}`, background: `color-mix(in srgb, ${toneVar(c.tone)} 12%, var(--surface))`, border: `1px solid color-mix(in srgb, ${toneVar(c.tone)} 35%, var(--border))` }} aria-label={`View booking ${c.ref} for ${c.guest}`} title={`${c.guest} · ${c.ref}`}>
        <span style={{ color: toneVar(c.tone) }}>{c.guest}</span>
      </Link>,
    );
    i += c.span - 1;
  }
  return out;
}

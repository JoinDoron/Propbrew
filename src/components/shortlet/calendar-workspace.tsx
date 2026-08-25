'use client';

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
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const VIEWS: { key: string; label: string; days: number }[] = [{ key: 'week', label: 'Week', days: 7 }, { key: 'two', label: '2 weeks', days: 14 }, { key: 'month', label: 'Month', days: 30 }];
const LEGEND: { status: SlBookingStatus; label: string }[] = [
  { status: 'enquiry', label: 'Enquiry' }, { status: 'confirmed', label: 'Confirmed' }, { status: 'checked_in', label: 'Checked-in' }, { status: 'checked_out', label: 'Checked-out' }, { status: 'closed', label: 'Closed' },
];
const fmt = (ms: number) => { const d = new Date(ms); return `${d.getUTCDate()} ${MON[d.getUTCMonth()]}`; };

export function CalendarWorkspace({ apartments, bookings, nowMs }: { apartments: CalApt[]; bookings: CalBooking[]; nowMs: number }) {
  const [days, setDays] = useState(14);
  const [start, setStart] = useState(nowMs);
  const [aptFilter, setAptFilter] = useState('all');

  const shownApts = aptFilter === 'all' ? apartments : apartments.filter((a) => a.id === aptFilter);
  const flips = useMemo(() => new Set(turnovers(bookings, start, days).filter((t) => t.sameDay).map((t) => t.apartmentId)), [bookings, start, days]);
  const dayList = useMemo(() => Array.from({ length: days }, (_, i) => new Date(start + i * DAY)), [start, days]);

  function exportIcs() {
    const dstamp = (iso: string) => iso.replace(/-/g, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Reeve Short-Let//EN', 'CALSCALE:GREGORIAN'];
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setStart((s) => s - days * DAY)} className="w-8 h-8 rounded-lg border border-border-2 grid place-items-center hover:bg-surface-2"><ChevronLeft size={15} /></button>
        <button onClick={() => setStart(nowMs)} className="h-8 px-3 rounded-lg border border-border-2 text-[12.5px] font-medium hover:bg-surface-2">Today</button>
        <button onClick={() => setStart((s) => s + days * DAY)} className="w-8 h-8 rounded-lg border border-border-2 grid place-items-center hover:bg-surface-2"><ChevronRight size={15} /></button>
        <span className="text-[13px] font-semibold ml-1">{fmt(start)} – {fmt(start + (days - 1) * DAY)}</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-border-2 overflow-hidden">
            {VIEWS.map((v) => <button key={v.key} onClick={() => setDays(v.days)} className={`text-[12px] px-2.5 h-8 ${days === v.days ? 'bg-primary text-white' : 'text-text-3'}`}>{v.label}</button>)}
          </div>
          <select value={aptFilter} onChange={(e) => setAptFilter(e.target.value)} className="h-8 px-2 rounded-lg border border-border-2 bg-surface text-[12px]"><option value="all">All apartments</option>{apartments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <button onClick={exportIcs} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border-2 text-[12px] font-medium hover:bg-surface-2"><Download size={13} /> Export .ics</button>
        </div>
      </div>

      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ minWidth: Math.max(720, 150 + days * 44) }} className="p-3">
            <div className="grid items-center mb-2" style={{ gridTemplateColumns: `150px repeat(${days}, 1fr)` }}>
              <span />
              {dayList.map((d, i) => {
                const today = d.getUTCFullYear() === new Date(nowMs).getUTCFullYear() && d.toISOString().slice(0, 10) === new Date(nowMs).toISOString().slice(0, 10);
                const wknd = d.getUTCDay() === 0 || d.getUTCDay() === 6;
                return <span key={i} className={`text-center text-[10px] ${today ? 'text-primary font-bold' : wknd ? 'text-text-2 font-medium' : 'text-text-3'}`}>{WD[d.getUTCDay()]}<br />{d.getUTCDate()}</span>;
              })}
            </div>
            {shownApts.map((a) => {
              const cells: (null | { guest: string; tone: Tone; span: number; ref: string })[] = Array(days).fill(null);
              for (const b of calendarBars(bookings, a.id, start, days)) if (cells[b.startCol] === null) cells[b.startCol] = { guest: b.guestName.split(' ')[0], tone: statusTone('shortlet-booking', b.status) as Tone, span: Math.min(b.span, days - b.startCol), ref: b.ref };
              return (
                <div key={a.id} className="grid items-center h-9 border-t border-border" style={{ gridTemplateColumns: `150px repeat(${days}, 1fr)` }}>
                  <div className="min-w-0 pr-2 flex items-center gap-1">
                    {flips.has(a.id) && <AlertTriangle size={11} className="text-negative flex-none" />}
                    <div className="min-w-0"><div className="text-[11.5px] font-medium truncate">{a.name}</div><div className="text-[9.5px] text-text-3 truncate">{a.property}</div></div>
                  </div>
                  {renderRow(cells)}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 flex-wrap text-[10.5px] text-text-3">
        {LEGEND.map((l) => <span key={l.status} className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[2px]" style={{ background: toneVar(statusTone('shortlet-booking', l.status) as Tone) }} />{humanizeStatus(l.label)}</span>)}
        <span className="inline-flex items-center gap-1 ml-auto"><AlertTriangle size={11} className="text-negative" /> same-day turnover</span>
      </div>
    </div>
  );
}

function renderRow(cells: (null | { guest: string; tone: Tone; span: number; ref: string })[]) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c === null) { out.push(<div key={i} className="h-6 mx-px rounded bg-surface-2" />); continue; }
    out.push(
      <Link key={i} href="/shortlet/bookings" className="h-6 mx-px rounded px-1.5 flex items-center overflow-hidden hover:brightness-95" style={{ gridColumn: `span ${c.span}`, background: `color-mix(in srgb, ${toneVar(c.tone)} 22%, transparent)`, border: `1px solid color-mix(in srgb, ${toneVar(c.tone)} 45%, transparent)` }} title={`${c.guest} · ${c.ref}`}>
        <span className="text-[9.5px] font-medium truncate" style={{ color: toneVar(c.tone) }}>{c.guest}</span>
      </Link>,
    );
    i += c.span - 1;
  }
  return out;
}

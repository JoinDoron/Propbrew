import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW_MS } from '@/domain/ppm';
import { calendarBars, turnovers } from '@/domain/shortlet';
import { statusTone, toneVar, type Tone } from '@/lib/status-tones';
import { AlertTriangle } from 'lucide-react';

const DAY = 24 * 3600 * 1000;
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS = 14;

/** FR-BM-04 (Short-Let PMS) — the multi-unit availability calendar. A 14-night
 *  grid across every apartment with guest bars, plus same-day turnover flags. */
export default async function ShortletCalendarPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const apts = repos.shortletApartments.list(actor).items;
  const bookings = repos.shortletBookings.list(actor).items;
  const props = new Map(repos.shortletProperties.list(actor).items.map((p) => [p.id, p.name]));
  const flips = new Set(turnovers(bookings, NOW_MS, DAYS).filter((t) => t.sameDay).map((t) => t.apartmentId));

  const days = Array.from({ length: DAYS }, (_, i) => new Date(NOW_MS + i * DAY));

  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="bg-surface border border-border rounded-2xl shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[900px] p-3">
            <div className="grid items-center mb-2" style={{ gridTemplateColumns: `150px repeat(${DAYS}, 1fr)` }}>
              <span />
              {days.map((d, i) => (
                <span key={i} className={`text-center text-[10px] ${d.getUTCDay() === 0 || d.getUTCDay() === 6 ? 'text-primary font-semibold' : 'text-text-3'}`}>{WD[d.getUTCDay()]}<br />{d.getUTCDate()}</span>
              ))}
            </div>
            {apts.map((a) => {
              const bars = calendarBars(bookings, a.id, NOW_MS, DAYS);
              const cells: (null | { guest: string; tone: Tone; span: number })[] = Array(DAYS).fill(null);
              for (const b of bars) if (cells[b.startCol] === null) cells[b.startCol] = { guest: b.guestName.split(' ')[0], tone: statusTone('shortlet-booking', b.status) as Tone, span: Math.min(b.span, DAYS - b.startCol) };
              return (
                <div key={a.id} className="grid items-center h-9 border-t border-border" style={{ gridTemplateColumns: `150px repeat(${DAYS}, 1fr)` }}>
                  <div className="min-w-0 pr-2 flex items-center gap-1">
                    {flips.has(a.id) && <AlertTriangle size={11} className="text-negative flex-none" />}
                    <div className="min-w-0"><div className="text-[11.5px] font-medium truncate">{a.name}</div><div className="text-[9.5px] text-text-3 truncate">{props.get(a.propertyId)}</div></div>
                  </div>
                  {renderRow(cells)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-text-3 mt-2 flex items-center gap-1.5"><AlertTriangle size={12} className="text-negative" /> flagged units have a same-day turnover — schedule a tight clean between checkout and check-in.</p>
    </div>
  );
}

function renderRow(cells: (null | { guest: string; tone: Tone; span: number })[]) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    if (c === null) { out.push(<div key={i} className="h-6 mx-px rounded bg-surface-2" />); continue; }
    out.push(
      <div key={i} className="h-6 mx-px rounded px-1.5 flex items-center overflow-hidden" style={{ gridColumn: `span ${c.span}`, background: `color-mix(in srgb, ${toneVar(c.tone)} 22%, transparent)`, border: `1px solid color-mix(in srgb, ${toneVar(c.tone)} 45%, transparent)` }}>
        <span className="text-[9.5px] font-medium truncate" style={{ color: toneVar(c.tone) }}>{c.guest}</span>
      </div>,
    );
    i += c.span - 1;
  }
  return out;
}

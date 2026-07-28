import { requireCapability } from '@/server/guard';
import { repos } from '@/server/data';
import { NOW, NOW_MS } from '@/domain/ppm';
import { statusTone, type Tone } from '@/lib/status-tones';
import { periodKpis, revenueVsExpense, movementsOn, calendarBars, turnovers, outstandingMinor } from '@/domain/shortlet';
import { ShortletDashboard, type CalRow, type Attn } from '@/components/shortlet/dashboard';

const DAY = 24 * 3600 * 1000;
const OPEN = ['enquiry', 'confirmed', 'checked_in'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Short-Let PMS — the calendar-first operator dashboard (FR-AN-05 / FR-BM-04).
 *  Period revenue/profit/occupancy/bookings, today's movements, a 7-night
 *  occupancy strip, revenue-vs-expense, and a smart attention feed
 *  (un-inspected checkouts, same-day turnover flips, balances, enquiries). */
export default async function ShortletDashboardPage() {
  const { actor } = await requireCapability('bookings_amenities');
  const apartments = repos.shortletApartments.list(actor).items;
  const bookings = repos.shortletBookings.list(actor).items;
  const expenses = repos.shortletExpenses.list(actor).items;
  const inspections = repos.shortletInspections.list(actor).items;
  const propList = repos.shortletProperties.list(actor).items;
  const propName = new Map(propList.map((p) => [p.id, p.name]));

  const now = new Date(NOW_MS);
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const kpis = periodKpis(apartments, bookings, expenses, monthStart, monthEnd);
  const move = movementsOn(bookings, NOW.slice(0, 10));

  // 7-night occupancy strip
  const days = Array.from({ length: 7 }, (_, i) => new Date(NOW_MS + i * DAY)).map((d) => `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()}`);
  const calendar: CalRow[] = apartments.map((a) => {
    const cells: CalRow['cells'] = Array(7).fill(null);
    for (const bar of calendarBars(bookings, a.id, NOW_MS, 7)) {
      if (cells[bar.startCol] === null) cells[bar.startCol] = { guest: bar.guestName.split(' ')[0], tone: statusTone('shortlet-booking', bar.status) as Tone, span: Math.min(bar.span, 7 - bar.startCol) };
    }
    return { apt: a.name, property: propName.get(a.propertyId) ?? '', cells };
  });

  const revExp = revenueVsExpense(bookings, expenses, NOW_MS, 6).map((m) => ({ label: MONTHS[Number(m.month.slice(5, 7)) - 1], revenueMinor: m.revenueMinor, expenseMinor: m.expenseMinor, profitMinor: m.profitMinor }));

  // Smart attention feed
  const inspectedIds = new Set(inspections.map((i) => i.bookingId));
  const aptName = new Map(apartments.map((a) => [a.id, a.name]));
  const attention: Attn[] = [];
  for (const b of bookings.filter((x) => x.status === 'checked_out' && !inspectedIds.has(x.id))) attention.push({ kind: 'inspect', title: `Inspect ${aptName.get(b.apartmentId) ?? ''}`, sub: `${b.guestName} checked out · caution ₦${(b.cautionFee.minor / 100).toLocaleString()} held`, href: '/shortlet/inspections' });
  for (const t of turnovers(bookings, NOW_MS, 10).filter((x) => x.sameDay)) attention.push({ kind: 'turnover', title: `Same-day turnover · ${aptName.get(t.apartmentId) ?? ''}`, sub: `Check-out & check-in both ${t.checkoutISO.slice(5)} — tight clean`, href: '/shortlet/calendar' });
  for (const b of bookings.filter((x) => OPEN.includes(x.status) && outstandingMinor(x) > 0)) attention.push({ kind: 'balance', title: `Balance due · ${b.guestName}`, sub: `₦${(outstandingMinor(b) / 100).toLocaleString()} outstanding on ${b.ref}`, href: '/shortlet/bookings' });
  for (const b of bookings.filter((x) => x.status === 'enquiry')) attention.push({ kind: 'enquiry', title: `New enquiry · ${b.guestName}`, sub: `${aptName.get(b.apartmentId) ?? ''} · ${b.checkIn.slice(5)}–${b.checkOut.slice(5)}`, href: '/shortlet/bookings' });

  return (
    <div className="max-w-[1100px] mx-auto">
      <ShortletDashboard
        kpis={kpis}
        monthLabel={`${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`}
        arrivals={move.arrivals.map((b) => ({ ref: b.ref, guest: b.guestName, apt: aptName.get(b.apartmentId) ?? '', source: b.source }))}
        departures={move.departures.map((b) => ({ ref: b.ref, guest: b.guestName, apt: aptName.get(b.apartmentId) ?? '', source: b.source }))}
        staying={move.staying.map((b) => ({ ref: b.ref, guest: b.guestName, apt: aptName.get(b.apartmentId) ?? '', source: b.source }))}
        calendar={calendar}
        days={days}
        revExp={revExp}
        attention={attention.slice(0, 6)}
      />
    </div>
  );
}

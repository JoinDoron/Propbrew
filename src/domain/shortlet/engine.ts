/**
 * Short-Let PMS — analytics & smart-feature engine (deterministic, no LLM).
 *
 * Covers the PRD Musts (occupancy, revenue-vs-expense, per-property profit,
 * agent performance, KPIs) plus features beyond the PRD, all advisory:
 * smart-rate suggestions, turnover/cleaning scheduling, guest CRM, and expense
 * insights. Money is handled in MINOR units; the UI formats.
 */

import type { Apartment, SlBooking, SlExpense, SlProperty, BookingSource } from './types';
import { nightsBetween } from './types';

const DAY = 24 * 3600 * 1000;
const REVENUE_STATUSES = new Set(['confirmed', 'checked_in', 'checked_out', 'closed']);

const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const monthKey = (isoDate: string) => isoDate.slice(0, 7);

/* --- occupancy (FR-AN-02; open-Q9: nights sold ÷ available nights) -------- */

export function nightsSoldInWindow(bookings: readonly SlBooking[], apartmentId: string, startMs: number, endMs: number): number {
  let nights = 0;
  for (const b of bookings) {
    if (b.apartmentId !== apartmentId || !REVENUE_STATUSES.has(b.status)) continue;
    const inMs = Math.max(startMs, Date.parse(b.checkIn));
    const outMs = Math.min(endMs, Date.parse(b.checkOut));
    if (outMs > inMs) nights += Math.round((outMs - inMs) / DAY);
  }
  return nights;
}

export function occupancyRate(bookings: readonly SlBooking[], apartmentId: string, startMs: number, endMs: number): number {
  const available = Math.max(1, Math.round((endMs - startMs) / DAY));
  return Math.min(100, Math.round((nightsSoldInWindow(bookings, apartmentId, startMs, endMs) / available) * 100));
}

/* --- KPIs + revenue/expense/profit ---------------------------------------- */

export type Kpis = { revenueMinor: number; expenseMinor: number; profitMinor: number; occupancyPct: number; bookings: number; cautionHeldMinor: number };

export function periodKpis(apartments: readonly Apartment[], bookings: readonly SlBooking[], expenses: readonly SlExpense[], startMs: number, endMs: number): Kpis {
  const inPeriod = (d: string) => { const t = Date.parse(d); return t >= startMs && t < endMs; };
  const revenueMinor = bookings.filter((b) => REVENUE_STATUSES.has(b.status) && inPeriod(b.checkIn)).reduce((n, b) => n + b.total.minor, 0);
  const expenseMinor = expenses.filter((e) => inPeriod(e.date)).reduce((n, e) => n + e.amount.minor, 0);
  const occ = apartments.length ? Math.round(apartments.reduce((n, a) => n + occupancyRate(bookings, a.id, startMs, endMs), 0) / apartments.length) : 0;
  const cautionHeldMinor = bookings.filter((b) => b.cautionStatus === 'held').reduce((n, b) => n + b.cautionFee.minor, 0);
  return { revenueMinor, expenseMinor, profitMinor: revenueMinor - expenseMinor, occupancyPct: occ, bookings: bookings.filter((b) => REVENUE_STATUSES.has(b.status) && inPeriod(b.checkIn)).length, cautionHeldMinor };
}

export type MonthPoint = { month: string; revenueMinor: number; expenseMinor: number; profitMinor: number };

/** FR-AN-01 — monthly revenue vs expenses over the last `count` months ending at nowMs. */
export function revenueVsExpense(bookings: readonly SlBooking[], expenses: readonly SlExpense[], nowMs: number, count = 6): MonthPoint[] {
  const months: string[] = [];
  const base = new Date(nowMs);
  for (let i = count - 1; i >= 0; i--) months.push(monthKey(iso(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1))));
  return months.map((month) => {
    const revenueMinor = bookings.filter((b) => REVENUE_STATUSES.has(b.status) && monthKey(b.checkIn) === month).reduce((n, b) => n + b.total.minor, 0);
    const expenseMinor = expenses.filter((e) => monthKey(e.date) === month).reduce((n, e) => n + e.amount.minor, 0);
    return { month, revenueMinor, expenseMinor, profitMinor: revenueMinor - expenseMinor };
  });
}

export type PropertyProfit = { propertyId: string; name: string; revenueMinor: number; expenseMinor: number; profitMinor: number; marginPct: number };

/** FR-EX-02 — profit per property. */
export function profitByProperty(properties: readonly SlProperty[], bookings: readonly SlBooking[], expenses: readonly SlExpense[]): PropertyProfit[] {
  return properties.map((p) => {
    const revenueMinor = bookings.filter((b) => b.propertyId === p.id && REVENUE_STATUSES.has(b.status)).reduce((n, b) => n + b.total.minor, 0);
    const expenseMinor = expenses.filter((e) => e.propertyId === p.id).reduce((n, e) => n + e.amount.minor, 0);
    const profitMinor = revenueMinor - expenseMinor;
    return { propertyId: p.id, name: p.name, revenueMinor, expenseMinor, profitMinor, marginPct: revenueMinor ? Math.round((profitMinor / revenueMinor) * 100) : 0 };
  }).sort((a, b) => b.profitMinor - a.profitMinor);
}

/* --- FR-AN-03 agent performance ------------------------------------------- */

export type AgentPerf = { source: BookingSource; label: string; bookings: number; revenueMinor: number; nights: number };
const SOURCE_LABEL: Record<BookingSource, string> = { direct: 'Direct', airbnb: 'Airbnb', booking_com: 'Booking.com', whatsapp: 'WhatsApp', agent: 'Agents' };

export function sourcePerformance(bookings: readonly SlBooking[]): AgentPerf[] {
  const m = new Map<BookingSource, AgentPerf>();
  for (const b of bookings) {
    if (!REVENUE_STATUSES.has(b.status)) continue;
    const cur = m.get(b.source) ?? { source: b.source, label: SOURCE_LABEL[b.source], bookings: 0, revenueMinor: 0, nights: 0 };
    cur.bookings += 1; cur.revenueMinor += b.total.minor; cur.nights += b.nights;
    m.set(b.source, cur);
  }
  return [...m.values()].sort((a, b) => b.revenueMinor - a.revenueMinor);
}

/* --- SMART: rate advisory (beyond PRD; advisory only) --------------------- */

export type RateSuggestion = { suggestedMinor: number; deltaPct: number; reasons: string[] };

/** Suggest a nightly rate from the base rate, weekend premium, seasonality and
 *  recent occupancy. Advisory — the PRD explicitly excludes dynamic pricing. */
export function suggestNightlyRate(apartment: Apartment, forDateISO: string, recentOccupancyPct: number): RateSuggestion {
  const base = apartment.nightlyRate.minor;
  const d = new Date(forDateISO);
  const dow = d.getUTCDay(); // 0 Sun .. 6 Sat
  const month = d.getUTCMonth(); // 0-11
  let factor = 1;
  const reasons: string[] = [];
  if (dow === 5 || dow === 6) { factor *= 1.15; reasons.push('Weekend premium +15%'); }
  if (month === 11) { factor *= 1.2; reasons.push('December peak +20%'); }
  else if (month === 3 || month === 7) { factor *= 1.08; reasons.push('Holiday season +8%'); }
  if (recentOccupancyPct >= 85) { factor *= 1.12; reasons.push(`High demand (${recentOccupancyPct}% occupied) +12%`); }
  else if (recentOccupancyPct <= 45) { factor *= 0.92; reasons.push(`Soft demand (${recentOccupancyPct}% occupied) −8%`); }
  if (reasons.length === 0) reasons.push('Base rate holds — steady demand');
  const suggestedMinor = Math.round((base * factor) / 5000) * 5000; // round to ₦50
  return { suggestedMinor, deltaPct: Math.round(((suggestedMinor - base) / base) * 100), reasons };
}

/* --- SMART: turnover / cleaning scheduler (beyond PRD) -------------------- */

export type Turnover = { apartmentId: string; checkoutBookingId: string; checkoutISO: string; nextBookingId: string | null; nextCheckInISO: string | null; sameDay: boolean; gapDays: number | null };
type TurnoverBooking = Pick<SlBooking, 'id' | 'apartmentId' | 'status' | 'checkIn' | 'checkOut'>;

/** For each upcoming checkout, find the next check-in on the same apartment and
 *  flag same-day flips (a real operational gap the PRD omits). */
export function turnovers(bookings: readonly TurnoverBooking[], nowMs: number, horizonDays = 21): Turnover[] {
  const endMs = nowMs + horizonDays * DAY;
  const out: Turnover[] = [];
  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const coMs = Date.parse(b.checkOut);
    if (coMs < nowMs - DAY || coMs > endMs) continue;
    const next = bookings
      .filter((n) => n.apartmentId === b.apartmentId && n.status !== 'cancelled' && Date.parse(n.checkIn) >= coMs)
      .sort((x, y) => Date.parse(x.checkIn) - Date.parse(y.checkIn))[0];
    const nextInMs = next ? Date.parse(next.checkIn) : null;
    const gapDays = nextInMs !== null ? Math.round((nextInMs - coMs) / DAY) : null;
    out.push({ apartmentId: b.apartmentId, checkoutBookingId: b.id, checkoutISO: b.checkOut, nextBookingId: next?.id ?? null, nextCheckInISO: next?.checkIn ?? null, sameDay: gapDays === 0, gapDays });
  }
  return out.sort((a, b) => Date.parse(a.checkoutISO) - Date.parse(b.checkoutISO));
}

/* --- SMART: guest CRM (beyond PRD) ---------------------------------------- */

export type GuestProfile = { name: string; phone: string; stays: number; lifetimeValueMinor: number; lastStayISO: string; repeat: boolean; vip: boolean };

/** Aggregate bookings by guest phone into a lightweight CRM: repeat + VIP flags. */
export function guestProfiles(bookings: readonly SlBooking[]): GuestProfile[] {
  const m = new Map<string, GuestProfile>();
  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const key = b.guestPhone || b.guestName;
    const cur = m.get(key) ?? { name: b.guestName, phone: b.guestPhone, stays: 0, lifetimeValueMinor: 0, lastStayISO: b.checkIn, repeat: false, vip: false };
    cur.stays += 1; cur.lifetimeValueMinor += b.total.minor;
    if (b.checkIn > cur.lastStayISO) cur.lastStayISO = b.checkIn;
    m.set(key, cur);
  }
  return [...m.values()].map((g) => ({ ...g, repeat: g.stays >= 2, vip: g.stays >= 3 || g.lifetimeValueMinor >= 100_000_00 })).sort((a, b) => b.lifetimeValueMinor - a.lifetimeValueMinor);
}

/* --- SMART: expense insights (beyond PRD) --------------------------------- */

export type ExpenseInsight = { totalMinor: number; dieselMinor: number; dieselPctOfRevenue: number; costPerOccupiedNightMinor: number; byCategory: { category: string; minor: number; pct: number }[] };

export function expenseInsights(bookings: readonly SlBooking[], expenses: readonly SlExpense[]): ExpenseInsight {
  const totalMinor = expenses.reduce((n, e) => n + e.amount.minor, 0);
  const dieselMinor = expenses.filter((e) => e.category === 'diesel').reduce((n, e) => n + e.amount.minor, 0);
  const revenue = bookings.filter((b) => REVENUE_STATUSES.has(b.status)).reduce((n, b) => n + b.total.minor, 0);
  const occupiedNights = bookings.filter((b) => REVENUE_STATUSES.has(b.status)).reduce((n, b) => n + b.nights, 0);
  const cats = new Map<string, number>();
  for (const e of expenses) cats.set(e.category, (cats.get(e.category) ?? 0) + e.amount.minor);
  return {
    totalMinor,
    dieselMinor,
    dieselPctOfRevenue: revenue ? Math.round((dieselMinor / revenue) * 100) : 0,
    costPerOccupiedNightMinor: occupiedNights ? Math.round(totalMinor / occupiedNights) : 0,
    byCategory: [...cats.entries()].map(([category, minor]) => ({ category, minor, pct: totalMinor ? Math.round((minor / totalMinor) * 100) : 0 })).sort((a, b) => b.minor - a.minor),
  };
}

/* --- caution-fee exposure (FR-BM-03) -------------------------------------- */

export function cautionExposure(bookings: readonly SlBooking[]): { heldMinor: number; heldCount: number; deductedMinor: number; refundedCount: number } {
  return {
    heldMinor: bookings.filter((b) => b.cautionStatus === 'held').reduce((n, b) => n + b.cautionFee.minor, 0),
    heldCount: bookings.filter((b) => b.cautionStatus === 'held').length,
    deductedMinor: bookings.reduce((n, b) => n + b.cautionDeducted.minor, 0),
    refundedCount: bookings.filter((b) => b.cautionStatus === 'refunded').length,
  };
}

/* --- calendar projection (FR-BM-04) --------------------------------------- */

export type CalBar = { bookingId: string; ref: string; guestName: string; status: string; startCol: number; span: number; source: BookingSource };
type BarBooking = Pick<SlBooking, 'id' | 'apartmentId' | 'status' | 'checkIn' | 'checkOut' | 'ref' | 'guestName' | 'source'>;

/** Bars for a `days`-day window starting at weekStartMs, per apartment. */
export function calendarBars(bookings: readonly BarBooking[], apartmentId: string, weekStartMs: number, days = 7): CalBar[] {
  const endMs = weekStartMs + days * DAY;
  return bookings
    .filter((b) => b.apartmentId === apartmentId && b.status !== 'cancelled' && Date.parse(b.checkOut) > weekStartMs && Date.parse(b.checkIn) < endMs)
    .map((b) => {
      const inMs = Date.parse(b.checkIn), outMs = Date.parse(b.checkOut);
      const startCol = Math.max(0, Math.round((inMs - weekStartMs) / DAY));
      const endCol = Math.min(days, Math.round((outMs - weekStartMs) / DAY));
      return { bookingId: b.id, ref: b.ref, guestName: b.guestName, status: b.status, startCol, span: Math.max(1, endCol - startCol), source: b.source };
    });
}

/* --- today's movements (FR-BM-04) ----------------------------------------- */

export function movementsOn(bookings: readonly SlBooking[], dayISO: string): { arrivals: SlBooking[]; departures: SlBooking[]; staying: SlBooking[] } {
  return {
    arrivals: bookings.filter((b) => b.checkIn === dayISO && b.status !== 'cancelled'),
    departures: bookings.filter((b) => b.checkOut === dayISO && b.status !== 'cancelled'),
    staying: bookings.filter((b) => b.checkIn < dayISO && b.checkOut > dayISO && b.status === 'checked_in'),
  };
}

export { nightsBetween };

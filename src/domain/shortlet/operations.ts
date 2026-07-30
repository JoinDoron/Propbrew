/**
 * Short-Let PMS — operations engine (deterministic, no LLM). Feature ideas from
 * a comparable product's flow, built on Vesta's design system:
 *   · Dynamic pricing — operator-set seasonal rate rules per apartment.
 *   · Maintenance     — a per-apartment issue tracker.
 *   · Agents          — booking-agent directory + performance + commission.
 *   · Reviews         — guest feedback after checkout.
 * All operator-set / operator-recorded; no algorithmic auto-pricing.
 */

import type { TenantScoped } from '@/domain/tenancy';
import type { SlBooking } from './types';

/* --- dynamic pricing ------------------------------------------------------ */

export type RuleType = 'fixed' | 'increase' | 'decrease';
export type PricingRule = TenantScoped & { id: string; apartmentId: string; label: string; fromISO: string; toISO: string; type: RuleType; amountMinor?: number; pct?: number };

export type RateRuleLike = { fromISO: string; toISO: string; type: RuleType; amountMinor?: number; pct?: number };

/** The nightly rate in effect on a date: the first rule that covers it, else base. */
export function effectiveRate(baseMinor: number, rules: readonly RateRuleLike[], dateISO: string): { minor: number; rule?: RateRuleLike } {
  const d = Date.parse(dateISO);
  const rule = rules.find((r) => Date.parse(r.fromISO) <= d && d <= Date.parse(r.toISO));
  if (!rule) return { minor: baseMinor };
  const minor = rule.type === 'fixed' ? (rule.amountMinor ?? baseMinor)
    : rule.type === 'increase' ? Math.round(baseMinor * (1 + (rule.pct ?? 0) / 100))
    : Math.round(baseMinor * (1 - (rule.pct ?? 0) / 100));
  return { minor, rule };
}

export function ruleRateMinor(baseMinor: number, r: Pick<PricingRule, 'type' | 'amountMinor' | 'pct'>): number {
  return r.type === 'fixed' ? (r.amountMinor ?? baseMinor)
    : r.type === 'increase' ? Math.round(baseMinor * (1 + (r.pct ?? 0) / 100))
    : Math.round(baseMinor * (1 - (r.pct ?? 0) / 100));
}

/* --- maintenance ---------------------------------------------------------- */

export type IssuePriority = 'low' | 'medium' | 'high' | 'urgent';
export type IssueStatus = 'open' | 'in_progress' | 'resolved';
export type MaintenanceIssue = TenantScoped & { id: string; apartmentId: string; title: string; description: string; priority: IssuePriority; status: IssueStatus; createdAt: string; resolvedAt?: string };

const URGENT = /leak|flood|no power|no water|fire|gas|electric|sparking|burst|sewage|break.?in|lock/i;
const HIGH = /\ba\/?c\b|air.?con|not cooling|fridge|freezer|generator|power|water|toilet|blocked|pump/i;

/** Suggest a priority from the issue title — a small delight on the log form. */
export function suggestPriority(title: string): IssuePriority {
  if (URGENT.test(title)) return 'urgent';
  if (HIGH.test(title)) return 'high';
  if (/paint|scratch|bulb|remote|cosmetic|minor/i.test(title)) return 'low';
  return 'medium';
}

export function issueStats(issues: readonly MaintenanceIssue[], nowMs: number): { open: number; inProgress: number; resolvedThisMonth: number } {
  const month = new Date(nowMs).toISOString().slice(0, 7);
  return {
    open: issues.filter((i) => i.status === 'open').length,
    inProgress: issues.filter((i) => i.status === 'in_progress').length,
    resolvedThisMonth: issues.filter((i) => i.status === 'resolved' && (i.resolvedAt ?? '').slice(0, 7) === month).length,
  };
}

export const ISSUE_NEXT: Record<IssueStatus, { event: string; to: IssueStatus; label: string } | null> = {
  open: { event: 'START', to: 'in_progress', label: 'Start work' },
  in_progress: { event: 'RESOLVE', to: 'resolved', label: 'Mark resolved' },
  resolved: null,
};

/* --- agents --------------------------------------------------------------- */

export type Agent = TenantScoped & { id: string; name: string; phone: string; commissionPct: number; status: 'active' | 'invited' };
export type AgentStats = { agent: Agent; bookings: number; nights: number; revenueMinor: number; commissionMinor: number };

const REVENUE = new Set(['confirmed', 'checked_in', 'checked_out', 'closed']);

/** Per-agent performance, matched on the booking's agentName. */
export function agentPerformance(agents: readonly Agent[], bookings: readonly SlBooking[]): AgentStats[] {
  return agents
    .map((agent) => {
      const mine = bookings.filter((b) => b.agentName === agent.name && REVENUE.has(b.status));
      const revenueMinor = mine.reduce((n, b) => n + b.total.minor, 0);
      return { agent, bookings: mine.length, nights: mine.reduce((n, b) => n + b.nights, 0), revenueMinor, commissionMinor: Math.round((revenueMinor * agent.commissionPct) / 100) };
    })
    .sort((a, b) => b.revenueMinor - a.revenueMinor);
}

/* --- reviews -------------------------------------------------------------- */

export type Review = TenantScoped & { id: string; bookingId: string; apartmentId: string; guestName: string; rating: number; comment: string; tags: string[]; atISO: string };

export function reviewStats(reviews: readonly Review[]): { count: number; avg: number; distribution: number[] } {
  const count = reviews.length;
  const avg = count ? Math.round((reviews.reduce((n, r) => n + r.rating, 0) / count) * 10) / 10 : 0;
  const distribution = [5, 4, 3, 2, 1].map((star) => reviews.filter((r) => r.rating === star).length);
  return { count, avg, distribution };
}

/** Average rating per apartment (id → {avg, count}). */
export function reviewsByApartment(reviews: readonly Review[]): Map<string, { avg: number; count: number }> {
  const m = new Map<string, { sum: number; count: number }>();
  for (const r of reviews) { const cur = m.get(r.apartmentId) ?? { sum: 0, count: 0 }; cur.sum += r.rating; cur.count += 1; m.set(r.apartmentId, cur); }
  return new Map([...m].map(([k, v]) => [k, { avg: Math.round((v.sum / v.count) * 10) / 10, count: v.count }]));
}

/* --- direct booking page (flow idea) -------------------------------------- */

export type PromoCode = { code: string; pct: number; active: boolean };
export type BookingPageConfig = { enabled: boolean; slug: string; cancellationPolicy: string; holdHours: number; promoCodes: PromoCode[] };

export type Funnel = { visits: number; searches: number; views: number; enquiries: number; confirmed: number; conversionPct: number };

/** A deterministic conversion funnel derived from the direct-booking pipeline
 *  (direct + WhatsApp sources drive the public page). Confirmed → back-fills the
 *  upper funnel at industry-shaped ratios so the numbers stay self-consistent. */
export function bookingPageFunnel(bookings: readonly SlBooking[]): Funnel {
  const direct = bookings.filter((b) => (b.source === 'direct' || b.source === 'whatsapp') && b.status !== 'cancelled');
  const confirmed = direct.filter((b) => b.status !== 'enquiry').length;
  const enquiries = direct.length;
  const views = enquiries * 6 + 4;
  const searches = Math.round(views * 1.6);
  const visits = searches * 2;
  return { visits, searches, views, enquiries, confirmed, conversionPct: enquiries ? Math.round((confirmed / enquiries) * 100) : 0 };
}

export type AptFunnel = { apartmentId: string; views: number; enquiries: number; confirmed: number; conversionPct: number };

export function bookingPageByApartment(bookings: readonly SlBooking[]): AptFunnel[] {
  const m = new Map<string, { enq: number; conf: number }>();
  for (const b of bookings) {
    if ((b.source !== 'direct' && b.source !== 'whatsapp') || b.status === 'cancelled') continue;
    const cur = m.get(b.apartmentId) ?? { enq: 0, conf: 0 };
    cur.enq += 1; if (b.status !== 'enquiry') cur.conf += 1;
    m.set(b.apartmentId, cur);
  }
  return [...m.entries()].map(([apartmentId, v]) => ({ apartmentId, views: v.enq * 6 + 2, enquiries: v.enq, confirmed: v.conf, conversionPct: v.enq ? Math.round((v.conf / v.enq) * 100) : 0 }));
}

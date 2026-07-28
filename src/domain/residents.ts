/**
 * EM-02 — resident engagement & risk (deterministic, no LLM).
 *
 * A composite engagement score (tenure × payment reliability × app activity ×
 * status), payment-reliability from invoice history, tenure, and at-a-glance
 * risk flags. Advisory signals for the manager — nothing here changes a record.
 */

import type { Tone } from '@/lib/status-tones';

const LATE = ['overdue', 'in_arrears', 'escalated'];
const DAY = 24 * 3600 * 1000;

export type Tenure = { days: number; years: number; label: string };

export function tenure(moveInDate: string, nowMs: number): Tenure {
  const days = Math.round((nowMs - Date.parse(moveInDate)) / DAY);
  const years = days / 365;
  const label = days < 0 ? `moves in ${moveInDate}` : years >= 1 ? `${years.toFixed(1)} yrs` : `${Math.max(0, Math.round(days / 30))} mo`;
  return { days, years: Math.max(0, years), label };
}

export type Reliability = { score: number; late: number; total: number; tone: Tone };

export function paymentReliability(bills: readonly { status: string }[]): Reliability {
  const total = bills.length;
  const late = bills.filter((b) => LATE.includes(b.status)).length;
  const score = total ? Math.round(((total - late) / total) * 100) : 100;
  return { score, late, total, tone: score >= 85 ? 'success' : score >= 60 ? 'warn' : 'danger' };
}

export type EngagementInput = {
  status: string;
  moveInDate: string;
  balanceOwed: boolean;
  bills: readonly { status: string }[];
  requests: readonly unknown[];
  bookings: readonly unknown[];
};

/** 0–100: tenure 25 · payment 35 · app activity 25 · status 15. */
export function engagementScore(r: EngagementInput, nowMs: number): number {
  const t = tenure(r.moveInDate, nowMs);
  const tenureFactor = Math.min(1, t.years / 3) * 25;
  const payFactor = (paymentReliability(r.bills).score / 100) * 35;
  const activityFactor = Math.min(1, (r.requests.length + r.bookings.length) / 4) * 25;
  const statusFactor = r.status === 'active' ? 15 : r.status === 'invited' ? 5 : 0;
  return Math.round(tenureFactor + payFactor + activityFactor + statusFactor);
}

export function engagementTone(score: number): Tone {
  return score >= 70 ? 'success' : score >= 45 ? 'warn' : 'danger';
}

export type RiskFlag = { label: string; tone: Tone };

export function riskFlags(r: EngagementInput, nowMs: number): RiskFlag[] {
  const flags: RiskFlag[] = [];
  const rel = paymentReliability(r.bills);
  const t = tenure(r.moveInDate, nowMs);
  if (r.balanceOwed) flags.push({ label: 'Outstanding balance', tone: 'danger' });
  if (rel.total > 0 && rel.score < 60) flags.push({ label: 'Poor payment history', tone: 'warn' });
  if (r.status === 'invited' || (r.status === 'active' && t.days >= 0 && t.days < 90)) flags.push({ label: 'New resident', tone: 'info' });
  if (r.status === 'moved_out') flags.push({ label: 'Moved out', tone: 'muted' });
  if (r.status === 'active' && r.requests.length + r.bookings.length === 0) flags.push({ label: 'Low engagement', tone: 'warn' });
  return flags;
}

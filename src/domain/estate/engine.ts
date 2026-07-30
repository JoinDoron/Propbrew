/**
 * Estate Experience — engine (deterministic, no LLM). Community health + NPS,
 * churn risk from arrears/engagement/complaints, arrears debtor risk + recovery
 * forecast + dunning ladder, tenancy stage flow + deposit exposure, and parcel/
 * locker utilisation. Advisory outputs are labelled as such in the UI.
 */

import type { Tone } from '@/lib/status-tones';
import type {
  ResidentFeedback, Sentiment, EngagementSnapshot, Complaint,
  CollectionCase, DunningStage, Tenancy, TenancyStage, Parcel, Locker,
} from './types';

const DAY = 24 * 3600 * 1000;

/* --- community pulse ------------------------------------------------------- */

export function sentimentBreakdown(feedback: readonly ResidentFeedback[]): Record<Sentiment, number> {
  return {
    positive: feedback.filter((f) => f.sentiment === 'positive').length,
    neutral: feedback.filter((f) => f.sentiment === 'neutral').length,
    negative: feedback.filter((f) => f.sentiment === 'negative').length,
  };
}

/** Net Promoter-style score in [-100, 100] from sentiment mix. */
export function npsScore(feedback: readonly ResidentFeedback[]): number {
  if (feedback.length === 0) return 0;
  const b = sentimentBreakdown(feedback);
  return Math.round(((b.positive - b.negative) / feedback.length) * 100);
}

/** Composite community health 0–100: engagement, sentiment, and open-complaint load. */
export function communityHealth(e: EngagementSnapshot | undefined, feedback: readonly ResidentFeedback[], complaints: readonly Complaint[]): { score: number; band: Tone; label: string } {
  const engagement = e ? Math.round((e.appAdoptionPct + e.eventAttendancePct + e.pollParticipationPct + e.announcementReadPct) / 4) : 60;
  const sentiment = Math.round((npsScore(feedback) + 100) / 2); // map -100..100 → 0..100
  const openHigh = complaints.filter((c) => c.status === 'open' && c.severity === 'high').length;
  const score = Math.max(0, Math.round(0.45 * engagement + 0.4 * sentiment - openHigh * 4));
  const band: Tone = score >= 75 ? 'success' : score >= 55 ? 'warn' : 'danger';
  return { score, band, label: score >= 75 ? 'Thriving' : score >= 55 ? 'Stable' : 'Needs care' };
}

export function complaintHotspots(complaints: readonly Complaint[]): { building: string; open: number; high: number }[] {
  const map = new Map<string, { building: string; open: number; high: number }>();
  for (const c of complaints) {
    if (c.status !== 'open') continue;
    const row = map.get(c.building) ?? { building: c.building, open: 0, high: 0 };
    row.open += 1; if (c.severity === 'high') row.high += 1;
    map.set(c.building, row);
  }
  return [...map.values()].sort((a, b) => b.high - a.high || b.open - a.open);
}

/** Per-resident churn/move-out risk from arrears, low engagement and complaints. */
export type ChurnSignal = { name: string; unitLabel: string; arrearsMinor: number; complaints: number; engaged: boolean };
export function churnRisk(s: ChurnSignal): { score: number; band: Tone } {
  let score = 0;
  if (s.arrearsMinor > 20_000_00) score += 45; else if (s.arrearsMinor > 0) score += 25;
  score += Math.min(30, s.complaints * 15);
  if (!s.engaged) score += 25;
  score = Math.min(100, score);
  const band: Tone = score >= 60 ? 'danger' : score >= 35 ? 'warn' : 'success';
  return { score, band };
}

/* --- collections ---------------------------------------------------------- */

/** Debtor risk 0–100 from aging and exposure — higher = harder to recover. */
export function debtorRisk(c: Pick<CollectionCase, 'agingDays' | 'amountMinor' | 'promiseStatus'>): { score: number; band: Tone; label: string } {
  let score = Math.min(70, Math.round(c.agingDays * 1.1)) + Math.min(20, Math.round(c.amountMinor / 25_000_00 * 10));
  if (c.promiseStatus === 'broken') score += 15;
  if (c.promiseStatus === 'kept') score -= 20;
  score = Math.max(0, Math.min(100, score));
  const band: Tone = score >= 60 ? 'danger' : score >= 35 ? 'warn' : 'success';
  return { score, band, label: score >= 60 ? 'High risk' : score >= 35 ? 'At risk' : 'Recoverable' };
}

/** Expected recovery = amount weighted by (100 − risk). */
export function recoveryForecast(cases: readonly CollectionCase[]): { outstandingMinor: number; expectedMinor: number; recoveryPct: number } {
  const outstandingMinor = cases.reduce((n, c) => n + c.amountMinor, 0);
  const expectedMinor = Math.round(cases.reduce((n, c) => n + c.amountMinor * (100 - debtorRisk(c).score) / 100, 0));
  return { outstandingMinor, expectedMinor, recoveryPct: outstandingMinor ? Math.round((expectedMinor / outstandingMinor) * 100) : 0 };
}

const NEXT_STAGE: Record<DunningStage, DunningStage> = { reminder: 'notice', notice: 'plan', plan: 'escalated', escalated: 'escalated' };
export function nextDunningStage(stage: DunningStage): DunningStage { return NEXT_STAGE[stage]; }

export const DUNNING_LABEL: Record<DunningStage, string> = { reminder: 'Friendly reminder', notice: 'Formal notice', plan: 'Payment plan', escalated: 'Escalated' };

/* --- tenancy -------------------------------------------------------------- */

export const TENANCY_FLOW: TenancyStage[] = ['applied', 'screening', 'approved', 'moving_in', 'active', 'notice', 'moving_out', 'closed'];
export const TENANCY_LABEL: Record<TenancyStage, string> = {
  applied: 'Applied', screening: 'Screening', approved: 'Approved', moving_in: 'Moving in', active: 'Active', notice: 'Notice given', moving_out: 'Moving out', closed: 'Closed',
};
export function nextTenancyStage(stage: TenancyStage): TenancyStage {
  const i = TENANCY_FLOW.indexOf(stage);
  return i >= 0 && i < TENANCY_FLOW.length - 1 ? TENANCY_FLOW[i + 1] : stage;
}
export function tenancyStageTone(stage: TenancyStage): Tone {
  if (stage === 'active') return 'success';
  if (stage === 'closed') return 'muted';
  if (stage === 'notice' || stage === 'moving_out') return 'warn';
  return 'info';
}

/** Lease days-to-expiry for renewal runway (active tenancies only). */
export function leaseRunwayDays(t: Pick<Tenancy, 'leaseEndISO'>, nowMs: number): number | null {
  return t.leaseEndISO ? Math.round((Date.parse(t.leaseEndISO) - nowMs) / DAY) : null;
}

export function depositExposureMinor(tenancies: readonly Tenancy[]): number {
  return tenancies.filter((t) => t.depositStatus === 'held' || t.depositStatus === 'pending').reduce((n, t) => n + t.depositMinor, 0);
}

/* --- parcels & lockers ---------------------------------------------------- */

export function isParcelOverdue(p: Pick<Parcel, 'status' | 'receivedISO'>, nowMs: number, graceDays = 3): boolean {
  return (p.status === 'stored' || p.status === 'overdue') && nowMs - Date.parse(p.receivedISO) > graceDays * DAY;
}

export function parcelStats(parcels: readonly Parcel[], nowMs: number): { inLocker: number; awaiting: number; overdue: number; collectedToday: number } {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  return {
    inLocker: parcels.filter((p) => p.status === 'stored').length,
    awaiting: parcels.filter((p) => p.status === 'received').length,
    overdue: parcels.filter((p) => isParcelOverdue(p, nowMs)).length,
    collectedToday: parcels.filter((p) => p.status === 'collected' && p.collectedISO?.slice(0, 10) === today).length,
  };
}

export function lockerUtilization(lockers: readonly Locker[]): { used: number; total: number; pct: number } {
  const used = lockers.filter((l) => l.parcelId).length;
  return { used, total: lockers.length, pct: lockers.length ? Math.round((used / lockers.length) * 100) : 0 };
}

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
  Motion, MotionStatus, CommunityEvent, RewardTier, RewardMember,
  BoardMember, Meeting, BoardElection, Candidate,
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

/* --- governance & e-voting ------------------------------------------------ */

export type MotionTally = {
  turnoutWeight: number; turnoutPct: number; quorumMet: boolean;
  approvalPct: number; thresholdMet: boolean; passing: boolean;
};

export type MotionLike = Pick<Motion, 'forWeight' | 'againstWeight' | 'abstainWeight' | 'eligibleWeight' | 'quorumPct' | 'thresholdPct'>;

/** Live tally for a motion: turnout vs quorum and approval vs threshold. */
export function motionTally(m: MotionLike): MotionTally {
  const turnoutWeight = m.forWeight + m.againstWeight + m.abstainWeight;
  const turnoutPct = m.eligibleWeight ? Math.round((turnoutWeight / m.eligibleWeight) * 100) : 0;
  const decisive = m.forWeight + m.againstWeight; // abstentions don't count toward approval
  const approvalPct = decisive ? Math.round((m.forWeight / decisive) * 100) : 0;
  const quorumMet = turnoutPct >= m.quorumPct;
  const thresholdMet = approvalPct >= m.thresholdPct;
  return { turnoutWeight, turnoutPct, quorumMet, approvalPct, thresholdMet, passing: quorumMet && thresholdMet };
}

/** The outcome a motion would record if closed now. */
export function motionOutcome(m: MotionLike): MotionStatus {
  const t = motionTally(m);
  if (!t.quorumMet) return 'quorum_failed';
  return t.thresholdMet ? 'passed' : 'rejected';
}

export function motionStatusTone(status: MotionStatus): Tone {
  switch (status) {
    case 'passed': return 'success';
    case 'rejected': return 'danger';
    case 'quorum_failed': return 'warn';
    case 'open': return 'progress';
    default: return 'muted';
  }
}
export const MOTION_STATUS_LABEL: Record<MotionStatus, string> = {
  draft: 'Draft', open: 'Voting open', passed: 'Passed', rejected: 'Rejected', quorum_failed: 'Quorum failed',
};

/* --- events & amenities --------------------------------------------------- */

export function eventFillPct(e: Pick<CommunityEvent, 'rsvps' | 'capacity'>): number {
  return e.capacity ? Math.min(100, Math.round((e.rsvps / e.capacity) * 100)) : 0;
}
export function isEventFull(e: Pick<CommunityEvent, 'rsvps' | 'capacity'>): boolean {
  return e.rsvps >= e.capacity;
}
export function eventState(e: Pick<CommunityEvent, 'cancelled' | 'endISO' | 'rsvps' | 'capacity'>, nowMs: number): 'past' | 'full' | 'filling' | 'open' {
  if (e.cancelled) return 'past';
  if (Date.parse(e.endISO) < nowMs) return 'past';
  if (isEventFull(e)) return 'full';
  return eventFillPct(e) >= 70 ? 'filling' : 'open';
}
export function amenityLoad(events: readonly CommunityEvent[], nowMs: number): { venue: string; rsvps: number; events: number }[] {
  const map = new Map<string, { venue: string; rsvps: number; events: number }>();
  for (const e of events) {
    if (e.cancelled || Date.parse(e.endISO) < nowMs) continue;
    const row = map.get(e.venue) ?? { venue: e.venue, rsvps: 0, events: 0 };
    row.rsvps += e.rsvps; row.events += 1;
    map.set(e.venue, row);
  }
  return [...map.values()].sort((a, b) => b.rsvps - a.rsvps);
}

/* --- loyalty & rewards ---------------------------------------------------- */

export const TIER_MIN: Record<RewardTier, number> = { bronze: 0, silver: 500, gold: 1500, platinum: 3000 };
const TIER_ORDER: RewardTier[] = ['bronze', 'silver', 'gold', 'platinum'];

export function tierFor(points: number): RewardTier {
  return [...TIER_ORDER].reverse().find((t) => points >= TIER_MIN[t]) ?? 'bronze';
}
/** Progress to the next tier, and points remaining (0 at platinum). */
export function tierProgress(points: number): { tier: RewardTier; next: RewardTier | null; pct: number; toNext: number } {
  const tier = tierFor(points);
  const i = TIER_ORDER.indexOf(tier);
  const next = i < TIER_ORDER.length - 1 ? TIER_ORDER[i + 1] : null;
  if (!next) return { tier, next: null, pct: 100, toNext: 0 };
  const span = TIER_MIN[next] - TIER_MIN[tier];
  const into = points - TIER_MIN[tier];
  return { tier, next, pct: Math.round((into / span) * 100), toNext: TIER_MIN[next] - points };
}
export const TIER_TONE: Record<RewardTier, Tone> = { bronze: 'muted', silver: 'info', gold: 'warn', platinum: 'success' };

export function leaderboard(members: readonly RewardMember[]): RewardMember[] {
  return [...members].sort((a, b) => b.points - a.points);
}
export function pointsIssued(members: readonly RewardMember[]): number {
  return members.reduce((n, m) => n + m.points, 0);
}
export const EARN_POINTS = { on_time_payment: 100, event: 50, poll: 30 } as const;
export type EarnReason = keyof typeof EARN_POINTS;

/* --- board & committee ---------------------------------------------------- */

/** Board term status by expiry date. */
export function termStatus(m: Pick<BoardMember, 'termEndISO'>, nowMs: number): { daysLeft: number; band: Tone; label: string } {
  const daysLeft = Math.round((Date.parse(m.termEndISO) - nowMs) / DAY);
  const band: Tone = daysLeft < 0 ? 'danger' : daysLeft <= 90 ? 'warn' : 'success';
  return { daysLeft, band, label: daysLeft < 0 ? 'Term ended' : daysLeft <= 90 ? 'Term ending' : 'In term' };
}

export function meetingState(m: Pick<Meeting, 'status' | 'whenISO' | 'attendees' | 'quorumRequired'>, nowMs: number): { tone: Tone; label: string; quorate: boolean } {
  const quorate = m.attendees >= m.quorumRequired;
  if (m.status === 'held') return { tone: quorate ? 'success' : 'warn', label: quorate ? 'Held · quorate' : 'Held · inquorate', quorate };
  const soon = Date.parse(m.whenISO) - nowMs <= 7 * DAY;
  return { tone: soon ? 'progress' : 'info', label: soon ? 'This week' : 'Scheduled', quorate };
}

/* --- board election ------------------------------------------------------- */

type ElectionLike = Pick<BoardElection, 'candidates' | 'eligibleWeight' | 'quorumPct'>;
export type ElectionTally = { totalVotes: number; turnoutPct: number; quorumMet: boolean; ranked: { candidate: Candidate; pct: number }[]; leader: Candidate | null; tie: boolean };

/** Plurality election tally: turnout vs quorum, and candidates ranked by votes. */
export function electionTally(e: ElectionLike): ElectionTally {
  const totalVotes = e.candidates.reduce((n, c) => n + c.votes, 0);
  const turnoutPct = e.eligibleWeight ? Math.round((totalVotes / e.eligibleWeight) * 100) : 0;
  const ranked = [...e.candidates].sort((a, b) => b.votes - a.votes).map((c) => ({ candidate: c, pct: totalVotes ? Math.round((c.votes / totalVotes) * 100) : 0 }));
  const tie = ranked.length >= 2 && ranked[0].candidate.votes > 0 && ranked[0].candidate.votes === ranked[1].candidate.votes;
  return { totalVotes, turnoutPct, quorumMet: turnoutPct >= e.quorumPct, ranked, leader: ranked[0]?.candidate ?? null, tie };
}

/** The candidate who would take the seat if closed now — needs quorum, votes, and no tie. */
export function electionWinner(e: ElectionLike): Candidate | null {
  const t = electionTally(e);
  if (!t.quorumMet || t.tie || !t.leader || t.leader.votes === 0) return null;
  return t.leader;
}

export const ELECTION_STATUS_LABEL: Record<BoardElection['status'], string> = {
  nominations: 'Nominations open', voting: 'Voting open', decided: 'Decided',
};
export function electionStatusTone(s: BoardElection['status']): Tone {
  return s === 'decided' ? 'success' : s === 'voting' ? 'progress' : 'info';
}

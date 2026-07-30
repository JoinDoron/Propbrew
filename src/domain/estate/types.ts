/**
 * Estate Experience — domain types for the new resident-facing estate surfaces:
 * a community-pulse command centre (sentiment, engagement, churn risk), an
 * arrears-recovery war room (collections), the tenancy lifecycle (move-in →
 * move-out + deposits), and a smart parcel-locker room. No framework imports.
 */

import type { TenantScoped } from '@/domain/tenancy';

/* --- community pulse ------------------------------------------------------- */

export type Sentiment = 'positive' | 'neutral' | 'negative';
export type FeedbackChannel = 'app' | 'whatsapp' | 'survey' | 'front_desk';
export type ResidentFeedback = TenantScoped & {
  id: string; estateId: string; residentName: string; unitLabel: string;
  channel: FeedbackChannel; sentiment: Sentiment; topic: string; text: string; atISO: string; acknowledged: boolean;
};

export type EngagementSnapshot = TenantScoped & {
  id: string; estateId: string;
  totalResidents: number; activeResidents: number;
  appAdoptionPct: number; eventAttendancePct: number; pollParticipationPct: number; announcementReadPct: number;
};

export type ComplaintStatus = 'open' | 'resolved';
export type Complaint = TenantScoped & {
  id: string; estateId: string; building: string; category: string; severity: 'low' | 'medium' | 'high'; status: ComplaintStatus; atISO: string;
};

/* --- collections (arrears recovery) --------------------------------------- */

export type DunningStage = 'reminder' | 'notice' | 'plan' | 'escalated';
export type PromiseStatus = 'pending' | 'kept' | 'broken';
export type CollectionCase = TenantScoped & {
  id: string; estateId: string; invoiceRef: string; residentName: string; unitLabel: string;
  amountMinor: number; agingDays: number; stage: DunningStage; remindersSent: number;
  promiseAmountMinor?: number; promiseDueISO?: string; promiseStatus?: PromiseStatus; lastActionISO?: string;
};

/* --- tenancy lifecycle ---------------------------------------------------- */

export type TenancyStage = 'applied' | 'screening' | 'approved' | 'moving_in' | 'active' | 'notice' | 'moving_out' | 'closed';
export type DepositStatus = 'pending' | 'held' | 'partially_refunded' | 'refunded' | 'withheld';
export type Tenancy = TenantScoped & {
  id: string; estateId: string; residentName: string; unitLabel: string;
  stage: TenancyStage; applicationISO: string; moveInISO?: string; leaseEndISO?: string; moveOutISO?: string;
  rentMinor: number; depositMinor: number; depositStatus: DepositStatus;
};

/* --- parcels & lockers ---------------------------------------------------- */

export type LockerSize = 'S' | 'M' | 'L';
export type Locker = TenantScoped & {
  id: string; estateId: string; bank: string; label: string; size: LockerSize; parcelId?: string;
};

export type ParcelStatus = 'received' | 'stored' | 'collected' | 'overdue';
export type Parcel = TenantScoped & {
  id: string; estateId: string; code: string; residentName: string; unitLabel: string; courier: string;
  lockerLabel?: string; size: LockerSize; status: ParcelStatus; receivedISO: string; collectedISO?: string;
};

/* --- governance & e-voting ------------------------------------------------ */

export type MotionCategory = 'budget' | 'rule' | 'works' | 'board';
export type MotionStatus = 'draft' | 'open' | 'passed' | 'rejected' | 'quorum_failed';
export type VoteChoice = 'for' | 'against' | 'abstain';
export type Motion = TenantScoped & {
  id: string; estateId: string; ref: string; title: string; summary: string; category: MotionCategory;
  status: MotionStatus; opensISO: string; closesISO: string;
  /** Vote weights (unit-weighted). eligibleWeight is the whole electorate. */
  eligibleWeight: number; forWeight: number; againstWeight: number; abstainWeight: number;
  quorumPct: number; thresholdPct: number; // pass needs quorum met AND approval ≥ threshold
  /** Decided at an EGM — residents who can't attend may assign a directed proxy. */
  egm?: boolean; egmMeetingId?: string;
};

/* --- proxy voting (for an EGM motion) ------------------------------------- */

export type ProxyStatus = 'held' | 'exercised' | 'revoked' | 'expired';
export type ProxyAssignment = TenantScoped & {
  id: string; estateId: string; motionId: string;
  grantorName: string; grantorUnit: string; grantorUserId: string; // the home giving its proxy
  holderName: string;        // who carries it (e.g. "Chair · Ngozi Okafor")
  direction: VoteChoice;     // the instructed direction the holder must cast
  status: ProxyStatus;
};

/* --- events & amenities --------------------------------------------------- */

export type EventCategory = 'social' | 'fitness' | 'kids' | 'meeting' | 'festive';
export type CommunityEvent = TenantScoped & {
  id: string; estateId: string; title: string; category: EventCategory; venue: string; host: string;
  startISO: string; endISO: string; capacity: number; rsvps: number; cancelled?: boolean;
};

/* --- loyalty & rewards ---------------------------------------------------- */

export type RewardTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type RewardMember = TenantScoped & {
  id: string; estateId: string; residentName: string; unitLabel: string;
  points: number; onTimeStreak: number; eventsAttended: number; pollsVoted: number; lastEarnedISO: string;
};

export type Perk = TenantScoped & {
  id: string; estateId: string; title: string; detail: string; cost: number; category: string; stock: number;
};

/* --- board & committee ---------------------------------------------------- */

export type BoardRole = 'Chair' | 'Treasurer' | 'Secretary' | 'Member';
export type BoardMember = TenantScoped & {
  id: string; estateId: string; name: string; unitLabel: string; role: BoardRole; portfolio: string; sinceISO: string; termEndISO: string;
};

export type MeetingType = 'AGM' | 'EGM' | 'committee';
export type MeetingStatus = 'scheduled' | 'held';
export type Meeting = TenantScoped & {
  id: string; estateId: string; title: string; type: MeetingType; whenISO: string; venue: string; status: MeetingStatus; resolutions: number; attendees: number; quorumRequired: number;
};

/* --- board election (vacant-seat) ----------------------------------------- */

export type ElectionStatus = 'nominations' | 'voting' | 'decided';
export type Candidate = { id: string; residentName: string; unitLabel: string; statement: string; votes: number };
export type BoardElection = TenantScoped & {
  id: string; estateId: string; ref: string; seatTitle: string; portfolio: string;
  status: ElectionStatus; opensISO: string; closesISO: string;
  /** whole electorate + quorum needed for the result to stand (unit-weighted). */
  eligibleWeight: number; quorumPct: number;
  candidates: Candidate[]; winnerCandidateId?: string;
};

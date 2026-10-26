import type { MessageKey } from './automation';
import type { Channel } from './types';

export type GuestVerificationStatus = 'not_started' | 'pending_review' | 'verified' | 'rejected';
export type IdentityDocumentType = 'nin' | 'passport' | 'drivers_licence' | 'voters_card' | 'other';

/** Stores only an operator attestation and the last four characters, never a raw identity document. */
export type GuestReadinessRecord = {
  tenantId: string;
  id: string;
  bookingId: string;
  documentType: IdentityDocumentType;
  documentLast4: string;
  status: GuestVerificationStatus;
  consentAtISO: string;
  reviewedAtISO?: string;
  reviewedBy?: string;
  checkedInAtISO?: string;
  checkedOutAtISO?: string;
  notes?: string;
};

export type ShortletTransactionKind = 'accommodation_payment' | 'caution_deposit' | 'refund' | 'damage_deduction';
export type ShortletTransactionStatus = 'pending_match' | 'matched' | 'approved' | 'rejected' | 'completed';
export type ShortletPaymentMethod = 'bank_transfer' | 'paystack' | 'flutterwave' | 'cash' | 'other';

export type ShortletTransaction = {
  tenantId: string;
  id: string;
  bookingId: string;
  kind: ShortletTransactionKind;
  amountMinor: number;
  currency: 'NGN';
  method: ShortletPaymentMethod;
  reference: string;
  status: ShortletTransactionStatus;
  requestedBy: string;
  requestedAtISO: string;
  reviewedBy?: string;
  reviewedAtISO?: string;
  note?: string;
};

export type TurnoverStatus = 'scheduled' | 'assigned' | 'in_progress' | 'ready_for_inspection' | 'ready' | 'blocked';
export type TurnoverChecklistItem = { key: 'linen' | 'bathroom' | 'kitchen' | 'utilities' | 'access'; label: string; done: boolean };
export type TurnoverTask = {
  tenantId: string;
  id: string;
  bookingId: string;
  apartmentId: string;
  dueAtISO: string;
  assigneeId?: string;
  assigneeName?: string;
  status: TurnoverStatus;
  checklist: TurnoverChecklistItem[];
  maintenanceIssueIds: string[];
  createdAtISO: string;
  updatedAtISO: string;
  note?: string;
};

export type ShortletMessageStatus = 'draft' | 'pending_approval' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled';
export type ShortletMessageRecord = {
  tenantId: string;
  id: string;
  bookingId: string;
  templateKey: MessageKey;
  body: string;
  scheduledForISO: string;
  status: ShortletMessageStatus;
  requestedBy: string;
  requestedAtISO: string;
  approvedBy?: string;
  approvedAtISO?: string;
  queueId?: string;
  providerId?: string;
  lastError?: string;
};

export type ShortletMessageTemplate = {
  tenantId: string;
  key: MessageKey;
  label: string;
  body: string;
  enabled: boolean;
  requiresApproval: boolean;
  updatedAtISO: string;
  updatedBy: string;
};

export type ShortletChannelConnection = {
  tenantId: string;
  id: string;
  apartmentId: string;
  channel: Channel;
  importUrl: string;
  status: 'pending' | 'active' | 'paused' | 'error';
  lastSyncAtISO?: string;
  lastSyncStatus?: 'success' | 'partial' | 'failed';
  importedEvents: number;
  lastError?: string;
  createdAtISO: string;
  updatedAtISO: string;
};

export type ShortletApprovalKind = 'guest_verification' | 'refund' | 'message_send' | 'rate_change' | 'team_role';
export type ShortletApproval = {
  tenantId: string;
  id: string;
  kind: ShortletApprovalKind;
  entityId: string;
  title: string;
  summary: string;
  status: 'pending' | 'approved' | 'rejected';
  requestedBy: string;
  requestedAtISO: string;
  decidedBy?: string;
  decidedAtISO?: string;
  decisionNote?: string;
  /** Typed identifiers needed to apply an approved change; never stores secrets. */
  payload?: Record<string, string>;
};

export type ShortletControlState = {
  guestReadiness: GuestReadinessRecord[];
  transactions: ShortletTransaction[];
  turnovers: TurnoverTask[];
  messages: ShortletMessageRecord[];
  templates: ShortletMessageTemplate[];
  channelConnections: ShortletChannelConnection[];
  approvals: ShortletApproval[];
};

export const TURNOVER_CHECKLIST: TurnoverChecklistItem[] = [
  { key: 'linen', label: 'Fresh linen and towels', done: false },
  { key: 'bathroom', label: 'Bathroom cleaned and restocked', done: false },
  { key: 'kitchen', label: 'Kitchen cleaned and inventory checked', done: false },
  { key: 'utilities', label: 'Power, water, AC and Wi-Fi tested', done: false },
  { key: 'access', label: 'Keys, lockbox and access instructions checked', done: false },
];

export function emptyShortletControlState(): ShortletControlState {
  return { guestReadiness: [], transactions: [], turnovers: [], messages: [], templates: [], channelConnections: [], approvals: [] };
}

export function transactionNetMinor(rows: readonly ShortletTransaction[], bookingId: string): number {
  return rows.filter((row) => row.bookingId === bookingId && ['approved', 'completed'].includes(row.status))
    .reduce((total, row) => total + (row.kind === 'refund' ? -row.amountMinor : row.kind === 'damage_deduction' ? 0 : row.amountMinor), 0);
}

export function bookingReadiness(record: GuestReadinessRecord | undefined, turnover: TurnoverTask | undefined): 'blocked' | 'attention' | 'ready' {
  if (!record || record.status === 'rejected' || turnover?.status === 'blocked') return 'blocked';
  if (record.status !== 'verified' || turnover && turnover.status !== 'ready') return 'attention';
  return 'ready';
}

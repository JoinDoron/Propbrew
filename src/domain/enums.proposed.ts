/**
 * PROPOSED enums — the PRD names the FIELD but never enumerates its values, so
 * these are estimation baselines, NOT contract. Each cites the requirement that
 * names the field and the open question that will confirm the members.
 *
 * Kept apart from `enums.ts` so the binding/proposed line is never blurred: a
 * screen importing from here is visibly building on an assumption.
 * No framework imports.
 */

/** Asset status — FM-01 names `status`, never its values. Confirm at discovery. */
export const PROPOSED_ASSET_STATUSES = [
  'operational',
  'degraded',
  'under_maintenance',
  'out_of_service',
  'archived',
] as const;
export type AssetStatus = (typeof PROPOSED_ASSET_STATUSES)[number];

/** Space occupancy — FM-04 "occupancy/allocation status per space". */
export const PROPOSED_OCCUPANCY_STATUSES = [
  'vacant',
  'occupied',
  'reserved',
  'unavailable',
] as const;
export type OccupancyStatus = (typeof PROPOSED_OCCUPANCY_STATUSES)[number];

/** Defect / inspection-item severity — FM-06 "pass/fail/severity", AI-F-03. */
export const PROPOSED_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Severity = (typeof PROPOSED_SEVERITIES)[number];

/**
 * Work-order priority ladder — §10 names only "Emergency" and "Routine", and
 * only "e.g.". FM-03 makes per-priority SLA timers a Must AC, so the full
 * ladder is a build blocker (see open questions). This is the proposed ladder.
 */
export const PROPOSED_WORK_ORDER_PRIORITIES = [
  'emergency',
  'high',
  'routine',
  'low',
] as const;
export type WorkOrderPriority = (typeof PROPOSED_WORK_ORDER_PRIORITIES)[number];

/** Payment status — SC-02 implies but never enumerates. */
export const PROPOSED_PAYMENT_STATUSES = [
  'pending',
  'succeeded',
  'failed',
  'refunded',
  'voided',
] as const;
export type PaymentStatus = (typeof PROPOSED_PAYMENT_STATUSES)[number];

/** Visitor pass status — EM-02 time-bound codes verified at the gate. */
export const PROPOSED_VISITOR_PASS_STATUSES = [
  'issued',
  'active',
  'used',
  'expired',
  'revoked',
] as const;
export type VisitorPassStatus = (typeof PROPOSED_VISITOR_PASS_STATUSES)[number];

/** Compliance obligation status — FM-06 "status and expiry per obligation". */
export const PROPOSED_COMPLIANCE_STATUSES = [
  'compliant',
  'due_soon',
  'expired',
  'not_applicable',
] as const;
export type ComplianceStatus = (typeof PROPOSED_COMPLIANCE_STATUSES)[number];

/** Announcement approval — EM-04 AI drafts "always require manager approval". */
export const PROPOSED_ANNOUNCEMENT_STATUSES = [
  'draft',
  'pending_approval',
  'scheduled',
  'sent',
] as const;
export type AnnouncementStatus = (typeof PROPOSED_ANNOUNCEMENT_STATUSES)[number];

/** Resident lifecycle — EM-02 invite + move-in/move-out. */
export const PROPOSED_RESIDENT_STATUSES = [
  'invited',
  'active',
  'moved_out',
] as const;
export type ResidentStatus = (typeof PROPOSED_RESIDENT_STATUSES)[number];

/** Vendor compliance — FM-05 documents with expiry alerts. */
export const PROPOSED_VENDOR_COMPLIANCE = [
  'valid',
  'expiring',
  'expired',
] as const;
export type VendorCompliance = (typeof PROPOSED_VENDOR_COMPLIANCE)[number];

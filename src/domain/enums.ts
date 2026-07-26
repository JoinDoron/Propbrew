/**
 * PRD-EXACT enums — enumerated verbatim in the PRD and therefore BINDING on
 * backend, mobile and QA. Changing a member here is a Change Request (§19).
 *
 * Anything the PRD only implies lives in `enums.proposed.ts`, clearly marked.
 * No framework imports.
 */

/* --- §10 state machines — the five status sets, verbatim ------------------ */

/** Work order (§10, FM-03). "branches: Rejected, Cancelled". */
export const WORK_ORDER_STATES = [
  'new',
  'triaged',
  'assigned',
  'in_progress',
  'on_hold',
  'resolved',
  'verified',
  'closed',
  'rejected',
  'cancelled',
] as const;
export type WorkOrderStatus = (typeof WORK_ORDER_STATES)[number];

/** Service charge / invoice (§10, EM-01). */
export const INVOICE_STATES = [
  'draft',
  'issued',
  'partially_paid',
  'paid',
  'overdue',
  'in_arrears',
  'escalated',
] as const;
export type InvoiceStatus = (typeof INVOICE_STATES)[number];

/** Booking (§10, EM-05). */
export const BOOKING_STATES = [
  'requested',
  'approved',
  'auto_approved',
  'confirmed',
  'completed',
  'declined',
  'cancelled',
] as const;
export type BookingStatus = (typeof BOOKING_STATES)[number];

/** SOS event (§10, EM-06). */
export const SOS_STATES = [
  'raised',
  'acknowledged',
  'responding',
  'resolved',
  'reviewed',
] as const;
export type SosStatus = (typeof SOS_STATES)[number];

/**
 * Marketplace order (§10, EM-09). `expired` is prd-implied: §10 says the order
 * "auto-expires" if the vendor does not accept within SLA, but Expired appears
 * nowhere in its own state list. Kept here because the auto-expire behaviour is
 * explicit even though the state name is not.
 */
export const ORDER_STATES = [
  'placed',
  'accepted',
  'fulfilled',
  'closed',
  'declined',
  'refunded',
  'expired',
] as const;
export type OrderStatus = (typeof ORDER_STATES)[number];

/* --- §7 roles & permission levels ----------------------------------------- */

export const ROLES = [
  'platform_admin',
  'executive',
  'estate_manager',
  'facility_manager',
  'technician',
  'resident',
  'security',
  'vendor',
  'investor',
] as const;
export type Role = (typeof ROLES)[number];

export const ACCESS_LEVELS = ['F', 'M', 'V', 'O', 'none'] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];

/* --- notification channels (EM-04 / SC-09) -------------------------------- */

export const NOTIFICATION_CHANNELS = ['in_app', 'push', 'sms', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/* --- payment methods (SC-02: "cards, transfers and USSD") ------------------ */

export const PAYMENT_METHODS = ['card', 'transfer', 'ussd'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/* --- inspections (FM-06: checklist items are pass/fail) ------------------- */

export const INSPECTION_RESULTS = ['pass', 'fail'] as const;
export type InspectionResult = (typeof INSPECTION_RESULTS)[number];

/* --- audit categories (SC-10) --------------------------------------------- */

/** "auth events, permission changes, financial actions, security events and AI overrides". */
export const AUDIT_CATEGORIES = [
  'auth',
  'permission_change',
  'financial',
  'security',
  'ai_override',
] as const;
export type AuditCategory = (typeof AUDIT_CATEGORIES)[number];

/* --- MoSCoW priority (§6.2) ------------------------------------------------ */

export const MOSCOW = ['Must', 'Should', 'Could'] as const;
export type Moscow = (typeof MOSCOW)[number];

/* --- site kind (glossary: Estate vs Facility) ----------------------------- */

export const SITE_KINDS = ['estate', 'facility'] as const;
export type SiteKind = (typeof SITE_KINDS)[number];

/* --- announcement targeting (EM-04) --------------------------------------- */

/**
 * EM-04's targeting is TWO orthogonal fields, not one enum: a `scope` plus an
 * audience/segment selector. This is the scope half.
 */
export const ANNOUNCEMENT_SCOPES = ['broadcast', 'estate', 'building'] as const;
export type AnnouncementScope = (typeof ANNOUNCEMENT_SCOPES)[number];

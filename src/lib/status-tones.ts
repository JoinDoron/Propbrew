/**
 * The bridge from §10 domain statuses to the design-system tone scale.
 *
 * Keeps status colour resolving through the theme (`--tone-*` in globals.css)
 * instead of being hard-coded per status, and — because each map is a closed
 * `Record<Status, Tone>` — an unmapped status is a COMPILE error, not a silent
 * grey pill. StatusPill renders these.
 */

import type {
  BookingStatus,
  InvoiceStatus,
  OrderStatus,
  SosStatus,
  WorkOrderStatus,
} from '@/domain/enums';
import type { Severity } from '@/domain/enums.proposed';

export const TONES = [
  'neutral',
  'info',
  'progress',
  'warn',
  'danger',
  'success',
  'muted',
] as const;
export type Tone = (typeof TONES)[number];

/** The CSS variable a tone resolves to. */
export function toneVar(tone: Tone): string {
  return `var(--tone-${tone})`;
}

export const WORK_ORDER_TONES: Record<WorkOrderStatus, Tone> = {
  new: 'neutral',
  triaged: 'info',
  assigned: 'info',
  in_progress: 'progress',
  on_hold: 'warn',
  resolved: 'success',
  verified: 'success',
  closed: 'muted',
  rejected: 'muted',
  cancelled: 'muted',
};

export const INVOICE_TONES: Record<InvoiceStatus, Tone> = {
  draft: 'neutral',
  issued: 'info',
  partially_paid: 'warn',
  paid: 'success',
  overdue: 'warn',
  in_arrears: 'danger',
  escalated: 'danger',
};

export const BOOKING_TONES: Record<BookingStatus, Tone> = {
  requested: 'neutral',
  approved: 'info',
  auto_approved: 'info',
  confirmed: 'progress',
  completed: 'success',
  declined: 'muted',
  cancelled: 'muted',
};

/** SOS gets the highest-salience tones given EM-06's sub-60-second target. */
export const SOS_TONES: Record<SosStatus, Tone> = {
  raised: 'danger',
  acknowledged: 'warn',
  responding: 'progress',
  resolved: 'success',
  reviewed: 'muted',
};

export const ORDER_TONES: Record<OrderStatus, Tone> = {
  placed: 'neutral',
  accepted: 'info',
  fulfilled: 'progress',
  closed: 'success',
  declined: 'muted',
  refunded: 'warn',
  expired: 'muted',
};

export const SEVERITY_TONES: Record<Severity, Tone> = {
  low: 'neutral',
  medium: 'info',
  high: 'warn',
  critical: 'danger',
};

/** Tone for a status given the machine it belongs to — used where the machine
 *  is known only at runtime (e.g. the shared transition timeline). */
/** Short-Let PMS booking statuses (new module). */
export const SHORTLET_TONES: Record<string, Tone> = {
  enquiry: 'neutral',
  confirmed: 'info',
  checked_in: 'progress',
  checked_out: 'warn',
  closed: 'success',
  cancelled: 'danger',
};

const MACHINE_TONES: Record<string, Record<string, Tone>> = {
  'work-order': WORK_ORDER_TONES,
  'service-charge': INVOICE_TONES,
  booking: BOOKING_TONES,
  'sos-event': SOS_TONES,
  'marketplace-order': ORDER_TONES,
  'shortlet-booking': SHORTLET_TONES,
};

export function statusTone(machineKey: string, status: string): Tone {
  return MACHINE_TONES[machineKey]?.[status] ?? 'neutral';
}

/** Title-case display labels — the enums are snake_case for the wire. */
export function humanizeStatus(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

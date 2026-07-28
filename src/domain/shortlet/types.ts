/**
 * Short-Let PMS — domain types (new module). No framework imports.
 *
 * A B2B PMS for Nigerian short-let operators (PRD v0.2): properties → apartments,
 * bookings with off-platform payments + caution fees, checkout inspections that
 * drive the caution decision, naira expenses (diesel-era), and analytics. The
 * localisation moat — caution fees, WhatsApp comms, diesel expenses, naira — is
 * modelled first-class. `[Inferred]` PRD items are marked in comments.
 */

import type { Money } from '@/domain/primitives';
import type { TenantScoped } from '@/domain/tenancy';

/* --- ids (module-local aliases; branded ids live in domain/ids.ts) -------- */
export type SlPropertyId = string;
export type ApartmentId = string;
export type SlBookingId = string;
export type SlInspectionId = string;
export type SlExpenseId = string;

/* --- enums ---------------------------------------------------------------- */

/** FR-BM: booking lifecycle. */
export type SlBookingStatus = 'enquiry' | 'confirmed' | 'checked_in' | 'checked_out' | 'closed' | 'cancelled';

/** Booking source (Assumption 4 — an attribute, not a role). Agent-attributed for FR-AN-03. */
export type BookingSource = 'direct' | 'airbnb' | 'booking_com' | 'whatsapp' | 'agent';

/** FR-BM-03 / FR-CI-03 — caution fee (refundable deposit) lifecycle. */
export type CautionStatus = 'pending' | 'held' | 'refunded' | 'partly_deducted' | 'forfeited';

/** FR-EX-01 — Nigerian short-let cost structure (diesel is deliberate localisation). */
export type ExpenseCategory = 'diesel' | 'salary' | 'repairs' | 'supplies' | 'cleaning' | 'utilities' | 'marketing' | 'other';

/** FR-CI-02 — per-item checkout condition. */
export type ItemCondition = 'ok' | 'damaged' | 'missing';

/** FR-IC — connected calendar channels. */
export type Channel = 'airbnb' | 'booking_com' | 'google';

/* --- entities ------------------------------------------------------------- */

/** FR-MP-01 — property (building) level. Bank details drive receipts (FR-RC-02). */
export type SlProperty = TenantScoped & {
  id: SlPropertyId;
  name: string;
  city: 'Lagos' | 'Abuja' | string;
  area: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
};

/** FR-MP-01 — apartment (unit) level. Access data is sensitive (NFR-08). */
export type Apartment = TenantScoped & {
  id: ApartmentId;
  propertyId: SlPropertyId;
  name: string; // "Unit 2B"
  type: string; // "1-bed" | "studio" | "2-bed"…
  nightlyRate: Money;
  status: 'active' | 'inactive';
  wifiSsid: string;
  wifiPassword: string; // sensitive
  accessInstructions: string; // sensitive
  houseRules: string[];
  amenities: string[];
  channels: Channel[]; // FR-IC connected feeds
};

/** FR-CI — checkout inspection line. */
export type InspectionItem = {
  label: string;
  condition: ItemCondition;
  note?: string;
  photo?: boolean; // FR-CI-02 photo evidence support
  chargeMinor?: number; // proposed deduction for this item
};

/** FR-CI — a completed (or draft) checkout inspection. Retained permanently (NFR-04). */
export type SlInspection = TenantScoped & {
  id: SlInspectionId;
  bookingId: SlBookingId;
  apartmentId: ApartmentId;
  inspectorName: string;
  at: string; // ISO
  items: InspectionItem[];
  outcome: 'clear' | 'deductions';
  damageTotal: Money;
  notes?: string;
};

/** FR-EX — a logged expense. */
export type SlExpense = TenantScoped & {
  id: SlExpenseId;
  propertyId: SlPropertyId;
  apartmentId?: ApartmentId;
  category: ExpenseCategory;
  amount: Money;
  date: string; // ISO date
  note: string;
};

/** FR-BM — a booking. Payments are recorded off-platform (Assumption 2). */
export type SlBooking = TenantScoped & {
  id: SlBookingId;
  ref: string;
  apartmentId: ApartmentId;
  propertyId: SlPropertyId;
  guestName: string;
  guestPhone: string;
  guestEmail?: string;
  checkIn: string; // ISO date
  checkOut: string; // ISO date
  nights: number;
  source: BookingSource;
  agentName?: string; // FR-AN-03
  nightlyRate: Money;
  total: Money; // nights × rate
  paid: Money; // FR-BM-02 recorded payments
  cautionFee: Money; // FR-BM-03 held deposit
  cautionStatus: CautionStatus;
  cautionDeducted: Money; // set by inspection outcome
  status: SlBookingStatus;
  guestToken: string; // FR-GL-01 personalised link token
  specialRequests?: string; // early check-in, airport pickup, allergies…
  createdAt: string;
};

/* --- helpers -------------------------------------------------------------- */

export const OPEN_BOOKING: SlBookingStatus[] = ['enquiry', 'confirmed', 'checked_in'];
export const STAYING: SlBookingStatus[] = ['checked_in'];

export function nightsBetween(checkIn: string, checkOut: string): number {
  const ms = Date.parse(checkOut) - Date.parse(checkIn);
  return Math.max(1, Math.round(ms / (24 * 3600 * 1000)));
}

export function outstandingMinor(b: Pick<SlBooking, 'total' | 'paid'>): number {
  return Math.max(0, b.total.minor - b.paid.minor);
}

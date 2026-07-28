/**
 * Short-Let PMS seed (new module). Tenant A only. A two-property Lagos/Abuja
 * portfolio with a busy late-July 2026 calendar: current stays, an un-inspected
 * checkout, upcoming arrivals, repeat guests (guest CRM), varied booking sources
 * (agent performance), caution fees in every state, diesel-era expenses across
 * months (revenue-vs-expense), and one completed damage inspection.
 */

import { SEED } from '@/server/identities';
import { money } from '@/domain/primitives';
import { nightsBetween } from '@/domain/shortlet/types';
import type { SlProperty, Apartment, SlBooking, SlExpense, SlInspection, BookingSource, CautionStatus } from '@/domain/shortlet/types';

const A = SEED.tenantA;
const ngn = (n: number) => money(n * 100, 'NGN');

export const shortletProperties: SlProperty[] = [
  { tenantId: A, id: 'slp-1', name: 'Marina Suites', city: 'Lagos', area: 'Victoria Island', bankName: 'GTBank', accountName: 'Marina Suites Ltd', accountNumber: '0123456789' },
  { tenantId: A, id: 'slp-2', name: 'Maitama Court', city: 'Abuja', area: 'Maitama', bankName: 'Zenith Bank', accountName: 'Maitama Court Ltd', accountNumber: '1098765432' },
] as unknown as SlProperty[];

const rules = ['No parties or events', 'No smoking indoors', 'Check-out by 12 noon', 'Quiet hours after 10pm'];
const amen = ['Fast WiFi', 'Backup power', 'Air-conditioning', 'Smart TV', '24/7 security'];

export const shortletApartments: Apartment[] = [
  { tenantId: A, id: 'ap-1', propertyId: 'slp-1', name: 'Unit 1A', type: 'Studio', nightlyRate: ngn(45000), status: 'active', wifiSsid: 'Marina-1A', wifiPassword: 'marina1a2026', accessInstructions: 'Lockbox at door 1A, code 4417. Lift to 1st floor.', houseRules: rules, amenities: amen, channels: ['airbnb', 'booking_com'] },
  { tenantId: A, id: 'ap-2', propertyId: 'slp-1', name: 'Unit 2B', type: '1-bed', nightlyRate: ngn(65000), status: 'active', wifiSsid: 'Marina-2B', wifiPassword: 'marina2b2026', accessInstructions: 'Concierge desk holds the key. Show your guest link.', houseRules: rules, amenities: amen, channels: ['airbnb'] },
  { tenantId: A, id: 'ap-3', propertyId: 'slp-1', name: 'Skyline Penthouse', type: '2-bed', nightlyRate: ngn(120000), status: 'active', wifiSsid: 'Marina-PH', wifiPassword: 'skyline2026', accessInstructions: 'Private lift, code 9928. Penthouse floor.', houseRules: rules, amenities: [...amen, 'Rooftop terrace', 'Chef on request'], channels: ['airbnb', 'booking_com', 'google'] },
  { tenantId: A, id: 'ap-4', propertyId: 'slp-2', name: 'Garden Suite', type: '1-bed', nightlyRate: ngn(55000), status: 'active', wifiSsid: 'Maitama-GS', wifiPassword: 'garden2026', accessInstructions: 'Gate code 1122. Suite is ground floor, left wing.', houseRules: rules, amenities: amen, channels: ['booking_com'] },
  { tenantId: A, id: 'ap-5', propertyId: 'slp-2', name: 'Terrace Suite', type: '1-bed', nightlyRate: ngn(58000), status: 'active', wifiSsid: 'Maitama-TS', wifiPassword: 'terrace2026', accessInstructions: 'Gate code 1122. Suite 3, first floor.', houseRules: rules, amenities: amen, channels: [] },
  { tenantId: A, id: 'ap-6', propertyId: 'slp-2', name: 'Diplomat Duplex', type: '2-bed', nightlyRate: ngn(95000), status: 'active', wifiSsid: 'Maitama-DD', wifiPassword: 'diplomat2026', accessInstructions: 'Meet caretaker at gate for keys.', houseRules: rules, amenities: [...amen, 'Private garden'], channels: ['airbnb'] },
] as unknown as Apartment[];

const RATE: Record<string, number> = { 'ap-1': 45000, 'ap-2': 65000, 'ap-3': 120000, 'ap-4': 55000, 'ap-5': 58000, 'ap-6': 95000 };
const PROP: Record<string, string> = { 'ap-1': 'slp-1', 'ap-2': 'slp-1', 'ap-3': 'slp-1', 'ap-4': 'slp-2', 'ap-5': 'slp-2', 'ap-6': 'slp-2' };

let seq = 4200;
function bk(apt: string, guest: string, phone: string, ci: string, co: string, status: SlBooking['status'], source: BookingSource, opts: { paidFrac?: number; caution?: number; cautionStatus?: CautionStatus; cautionDeducted?: number; agent?: string; email?: string } = {}): SlBooking {
  const nights = nightsBetween(ci, co);
  const rate = RATE[apt];
  const totalMinor = nights * rate * 100;
  const caution = opts.caution ?? Math.round(rate * 100 * 1); // ~1 night as deposit
  return {
    tenantId: A, id: `slb-${apt}-${seq}`, ref: `SL-${seq++}`, apartmentId: apt, propertyId: PROP[apt],
    guestName: guest, guestPhone: phone, guestEmail: opts.email,
    checkIn: ci, checkOut: co, nights, source, agentName: opts.agent,
    nightlyRate: money(rate * 100, 'NGN'), total: money(totalMinor, 'NGN'), paid: money(Math.round(totalMinor * (opts.paidFrac ?? 1)), 'NGN'),
    cautionFee: money(caution, 'NGN'), cautionStatus: opts.cautionStatus ?? 'held', cautionDeducted: money(opts.cautionDeducted ?? 0, 'NGN'),
    status, guestToken: `g-${apt}-${seq}`, createdAt: ci,
  } as unknown as SlBooking;
}

export const shortletBookings: SlBooking[] = [
  // current stays (checked_in)
  bk('ap-1', 'Chidinma Eze', '+2348031111111', '2026-07-24', '2026-07-28', 'checked_in', 'airbnb', { email: 'chidinma@example.ng' }),
  bk('ap-2', 'Tunde Bakare', '+2348032222222', '2026-07-26', '2026-07-30', 'checked_in', 'direct', { paidFrac: 0.5 }),
  bk('ap-5', 'Chidinma Eze', '+2348031111111', '2026-07-25', '2026-07-28', 'checked_in', 'direct'),
  // checkout awaiting inspection
  bk('ap-3', 'David Okon', '+2348033333333', '2026-07-20', '2026-07-25', 'checked_out', 'booking_com', { caution: 15000000 }),
  // upcoming (confirmed / arriving)
  bk('ap-4', 'Sophia Adeyemi', '+2348034444444', '2026-07-27', '2026-07-29', 'confirmed', 'airbnb'),
  bk('ap-5', 'Blessing Eze', '+2348035555555', '2026-07-28', '2026-08-01', 'confirmed', 'booking_com'), // same-day flip with Chidinma's checkout
  bk('ap-3', 'Grace Nwosu', '+2348036666666', '2026-07-30', '2026-08-04', 'confirmed', 'agent', { agent: 'Kunle Bookings' }),
  bk('ap-2', 'Aisha Mohammed', '+2348037777777', '2026-08-02', '2026-08-05', 'confirmed', 'whatsapp'),
  bk('ap-1', 'Chidinma Eze', '+2348031111111', '2026-08-10', '2026-08-13', 'confirmed', 'direct'), // repeat → VIP
  // enquiry (pending)
  bk('ap-6', 'Fatima Sani', '+2348038888888', '2026-08-05', '2026-08-09', 'enquiry', 'whatsapp'),
  // an iCal-imported Airbnb booking that CLASHES with Sophia on ap-4 (double-booking guard demo)
  bk('ap-4', 'Airbnb import — R. Cole', '+2348030505050', '2026-07-28', '2026-07-31', 'confirmed', 'airbnb'),
  // recently closed (feed analytics)
  bk('ap-4', 'James Bello', '+2348039999999', '2026-07-22', '2026-07-26', 'closed', 'direct', { cautionStatus: 'refunded' }),
  bk('ap-6', 'Emeka Obi', '+2348030000000', '2026-07-18', '2026-07-24', 'closed', 'agent', { agent: 'Kunle Bookings', cautionStatus: 'partly_deducted', cautionDeducted: 3300000 }),
  bk('ap-1', 'Michael Ade', '+2348030101010', '2026-07-12', '2026-07-16', 'closed', 'direct', { cautionStatus: 'refunded' }),
  // history for the 6-month revenue chart
  bk('ap-3', 'Ngozi Peters', '+2348030202020', '2026-06-20', '2026-06-25', 'closed', 'airbnb', { cautionStatus: 'refunded' }),
  bk('ap-2', 'Ola Trust', '+2348030303030', '2026-06-10', '2026-06-15', 'closed', 'direct', { cautionStatus: 'refunded' }),
  bk('ap-4', 'Sam Williams', '+2348030404040', '2026-05-14', '2026-05-18', 'closed', 'booking_com', { cautionStatus: 'refunded' }),
] as unknown as SlBooking[];

const exp = (id: string, prop: string, cat: SlExpense['category'], amt: number, date: string, note: string): SlExpense =>
  ({ tenantId: A, id, propertyId: prop, category: cat, amount: money(amt * 100, 'NGN'), date, note } as unknown as SlExpense);

export const shortletExpenses: SlExpense[] = [
  exp('se-1', 'slp-1', 'diesel', 180000, '2026-07-05', 'Generator diesel — 200L'),
  exp('se-2', 'slp-1', 'salary', 250000, '2026-07-01', 'Housekeeper + caretaker'),
  exp('se-3', 'slp-1', 'cleaning', 45000, '2026-07-10', 'Deep clean + laundry'),
  exp('se-4', 'slp-1', 'repairs', 85000, '2026-07-12', 'AC servicing — Unit 2B'),
  exp('se-5', 'slp-1', 'supplies', 38000, '2026-07-08', 'Toiletries + linen restock'),
  exp('se-6', 'slp-2', 'diesel', 150000, '2026-07-06', 'Generator diesel — Abuja'),
  exp('se-7', 'slp-2', 'salary', 220000, '2026-07-01', 'On-site manager'),
  exp('se-8', 'slp-2', 'cleaning', 40000, '2026-07-11', 'Turnaround cleaning'),
  exp('se-9', 'slp-2', 'utilities', 60000, '2026-07-09', 'Water + waste'),
  exp('se-10', 'slp-1', 'marketing', 30000, '2026-07-03', 'Instagram promotion'),
  // prior months
  exp('se-11', 'slp-1', 'diesel', 170000, '2026-06-05', 'Generator diesel'),
  exp('se-12', 'slp-1', 'salary', 250000, '2026-06-01', 'Staff salaries'),
  exp('se-13', 'slp-2', 'diesel', 145000, '2026-06-06', 'Generator diesel'),
  exp('se-14', 'slp-1', 'salary', 250000, '2026-05-01', 'Staff salaries'),
  exp('se-15', 'slp-2', 'diesel', 160000, '2026-05-07', 'Generator diesel'),
] as unknown as SlExpense[];

export const shortletInspections: SlInspection[] = [
  {
    tenantId: A, id: 'si-1', bookingId: 'slb-ap-6-4211', apartmentId: 'ap-6', inspectorName: 'Housekeeping · Ada', at: '2026-07-24T11:30:00Z',
    items: [
      { label: 'Living room', condition: 'ok' },
      { label: 'Kitchen & appliances', condition: 'ok' },
      { label: 'Bathroom', condition: 'damaged', note: 'Cracked wash-hand basin', photo: true, chargeMinor: 2500000 },
      { label: 'Bedrooms', condition: 'ok' },
      { label: 'Inventory (towels, remote)', condition: 'missing', note: '2 towels missing', photo: true, chargeMinor: 800000 },
    ],
    outcome: 'deductions', damageTotal: money(3300000, 'NGN'), notes: 'Deducted ₦33,000 from caution fee; guest notified.',
  },
] as unknown as SlInspection[];

/**
 * EM-05 — amenity booking analytics (deterministic, no LLM).
 *
 * An amenity registry with capacity, fee and an auto-approval rule; utilisation,
 * conflict detection (same amenity, overlapping window), an indicative weekly
 * usage heatmap, and the auto-approval decision for a slot. Approvals themselves
 * stay a §10 machine transition, gated and human-driven where the rule is manual.
 */

import type { Tone } from '@/lib/status-tones';

export type AutoRule = 'always' | 'off_peak' | 'manual';
export type Amenity = { name: string; capacity: number; autoApprove: AutoRule; feeMinor: number };

export const AMENITIES: Amenity[] = [
  { name: 'Clubhouse', capacity: 1, autoApprove: 'manual', feeMinor: 1_500_000 },
  { name: 'Tennis Court', capacity: 2, autoApprove: 'off_peak', feeMinor: 0 },
  { name: 'Pool (private session)', capacity: 1, autoApprove: 'manual', feeMinor: 1_000_000 },
  { name: 'Gym', capacity: 12, autoApprove: 'always', feeMinor: 0 },
  { name: 'BBQ Area', capacity: 1, autoApprove: 'off_peak', feeMinor: 500_000 },
];

export function amenityOf(name: string): Amenity {
  return AMENITIES.find((a) => a.name === name) ?? { name, capacity: 1, autoApprove: 'manual', feeMinor: 0 };
}

export type BookingLike = { id: string; amenity: string; status: string; slot: string; feeMinor: number | null };

const SLOT_HOURS = 2; // each booking holds a 2-hour window
const ACTIVE = ['requested', 'approved', 'auto_approved', 'confirmed', 'completed'];

function hourOf(slot: string): number {
  return new Date(slot).getUTCHours();
}
function dayOf(slot: string): number {
  return new Date(slot).getUTCDay(); // 0 Sun … 6 Sat
}

/** Off-peak = weekday before 17:00. The rule the auto-approver applies. */
export function wouldAutoApprove(amenityName: string, slot: string): { auto: boolean; reason: string } {
  const a = amenityOf(amenityName);
  if (a.autoApprove === 'always') return { auto: true, reason: 'open-access amenity' };
  if (a.autoApprove === 'manual') return { auto: false, reason: 'manual approval required' };
  const day = dayOf(slot), hr = hourOf(slot);
  const offPeak = day >= 1 && day <= 5 && hr < 17;
  return { auto: offPeak, reason: offPeak ? 'off-peak weekday slot' : 'peak/weekend — needs approval' };
}

export type Utilisation = { amenity: string; bookings: number; capacity: number; pct: number; tone: Tone; rule: AutoRule };

export function utilisation(bookings: readonly BookingLike[]): Utilisation[] {
  return AMENITIES.map((a) => {
    const n = bookings.filter((b) => b.amenity === a.name && ACTIVE.includes(b.status)).length;
    // utilisation vs a nominal 14 weekly slots per capacity unit
    const slots = a.capacity * 14;
    const pct = Math.min(100, Math.round((n / slots) * 100) * 4); // scaled for a small demo dataset
    return { amenity: a.name, bookings: n, capacity: a.capacity, pct, tone: (pct >= 70 ? 'danger' : pct >= 40 ? 'warn' : 'success') as Tone, rule: a.autoApprove };
  }).sort((x, y) => y.bookings - x.bookings);
}

export type Conflict = { amenity: string; a: string; b: string; slot: string };

/** Two active bookings on the same, capacity-1 amenity within one window. */
export function conflicts(bookings: readonly BookingLike[]): Conflict[] {
  const out: Conflict[] = [];
  const active = bookings.filter((b) => ACTIVE.includes(b.status));
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const x = active[i], y = active[j];
      if (x.amenity !== y.amenity || amenityOf(x.amenity).capacity > 1) continue;
      const gap = Math.abs(Date.parse(x.slot) - Date.parse(y.slot)) / (3600 * 1000);
      if (gap < SLOT_HOURS) out.push({ amenity: x.amenity, a: x.id, b: y.id, slot: x.slot });
    }
  }
  return out;
}

/** Indicative weekly usage grid (7 days × 6 time-bands) for one amenity —
 *  deterministic from the amenity name, so it is stable and demoable. */
export function usageHeatmap(amenityName: string): number[][] {
  let h = 0;
  for (const c of amenityName) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  const grid: number[][] = [];
  for (let d = 0; d < 7; d++) {
    const row: number[] = [];
    for (let t = 0; t < 6; t++) {
      const weekend = d === 0 || d === 6 ? 2 : 0;
      const evening = t >= 4 ? 2 : 0;
      const noise = ((Math.imul(h + 1, (d + 1) * (t + 3)) >> 4) & 3);
      row.push(Math.min(4, weekend + evening + noise) );
    }
    grid.push(row);
  }
  return grid;
}

export const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const BANDS = ['8a', '10a', '12p', '2p', '4p', '6p'];

export function revenue(bookings: readonly BookingLike[]): number {
  return bookings.filter((b) => ['confirmed', 'completed'].includes(b.status)).reduce((n, b) => n + (b.feeMinor ?? 0), 0);
}

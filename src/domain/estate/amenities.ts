import { z } from 'zod';

export type EstateAmenity = {
  id: string; tenantId: string; siteId: string; name: string; capacity: number; feeMinor: number;
  autoApprove: 'always' | 'off_peak' | 'manual'; openMinute: number; closeMinute: number;
  durationMinutes: number; status: 'active' | 'archived'; revision: number; createdAt: string; updatedAt: string;
};
export type AmenityBookingInterval = { id: string; tenantId: string; estateId: string; amenity: string; amenityId?: string; status: string; slot: string; endISO?: string };
export const RESERVING_BOOKING_STATUSES = ['requested', 'approved', 'auto_approved', 'confirmed'] as const;
const text = (min: number, max: number) => z.string().trim().min(min).max(max).refine((value) => !/[\u0000-\u001f\u007f]/.test(value));
export const amenityDetailsSchema = z.strictObject({
  name: text(2, 100), capacity: z.number().int().min(1).max(500), feeMajor: z.string().trim().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/),
  autoApprove: z.enum(['always', 'off_peak', 'manual']), openMinute: z.number().int().min(0).max(1439),
  closeMinute: z.number().int().min(1).max(1440), durationMinutes: z.number().int().min(15).max(720),
}).refine((value) => value.closeMinute > value.openMinute && value.durationMinutes <= value.closeMinute - value.openMinute, { message: 'Opening hours must contain a complete booking slot.' });
export type AmenityDetails = z.infer<typeof amenityDetailsSchema>;
export function amenityMinor(major: string): number {
  if (!/^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$/.test(major)) throw new Error('Enter a non-negative NGN amount with at most two decimal places.');
  const [whole, fraction = ''] = major.split('.');
  const minor = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  if (minor > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Amount is too large.');
  return Number(minor);
}
export function amenityWatParts(iso: string): { day: number; minute: number; date: string } {
  const ms = Date.parse(iso); if (!Number.isFinite(ms)) throw new Error('Choose a valid date and time.');
  // WAT has a fixed UTC+01 offset and no daylight saving transition.
  const wat = new Date(ms + 3600_000);
  return { day: wat.getUTCDay(), minute: wat.getUTCHours() * 60 + wat.getUTCMinutes(), date: wat.toISOString().slice(0, 10) };
}
export function amenityApproval(amenity: Pick<EstateAmenity, 'autoApprove'>, slot: string) {
  const { day, minute } = amenityWatParts(slot);
  const auto = amenity.autoApprove === 'always' || amenity.autoApprove === 'off_peak' && day >= 1 && day <= 5 && minute < 17 * 60;
  return { auto, reason: auto ? 'Configured approval rule satisfied in WAT.' : 'Manager approval is required.' };
}
export function amenityBookingEnd(amenity: EstateAmenity, slot: string, nowMs: number): string {
  const startMs = Date.parse(slot);
  if (!Number.isFinite(startMs) || startMs <= nowMs) throw new Error('Choose a future booking time.');
  if (new Date(startMs).getUTCSeconds() !== 0 || new Date(startMs).getUTCMilliseconds() !== 0) throw new Error('Booking times must use whole minutes.');
  const { minute } = amenityWatParts(slot);
  if (minute < amenity.openMinute || minute + amenity.durationMinutes > amenity.closeMinute) throw new Error('The whole booking must fit within the amenity’s WAT opening hours.');
  return new Date(startMs + amenity.durationMinutes * 60_000).toISOString();
}
export function matchingAmenityBookings(amenity: EstateAmenity, bookings: readonly AmenityBookingInterval[]) {
  return bookings.filter((row) => row.tenantId === amenity.tenantId && row.estateId === amenity.siteId
    && (row.amenityId ? row.amenityId === amenity.id : row.amenity === amenity.name)
    && (RESERVING_BOOKING_STATUSES as readonly string[]).includes(row.status));
}
/** Existing requested slots reserve capacity too. Clip intervals to the new
 * slot and sweep their boundaries; consecutive reservations are not concurrent. */
export function amenitySlotAvailable(amenity: EstateAmenity, slot: string, endISO: string, bookings: readonly AmenityBookingInterval[], excludeId?: string): boolean {
  const start = Date.parse(slot), end = Date.parse(endISO);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return false;
  const events: { at: number; change: number }[] = [];
  for (const row of matchingAmenityBookings(amenity, bookings)) {
    if (row.id === excludeId) continue;
    const a = Date.parse(row.slot);
    if (!Number.isFinite(a)) return false;
    const b = row.endISO ? Date.parse(row.endISO) : a + 120 * 60_000;
    if (!Number.isFinite(b) || b <= a) return false;
    if (a < end && b > start) {
      events.push({ at: Math.max(a, start), change: 1 }, { at: Math.min(b, end), change: -1 });
    }
  }
  events.sort((a, b) => a.at - b.at || a.change - b.change);
  let occupied = 0;
  for (const event of events) { occupied += event.change; if (occupied >= amenity.capacity) return false; }
  return true;
}
export function watMinutes(value: number): string { return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`; }

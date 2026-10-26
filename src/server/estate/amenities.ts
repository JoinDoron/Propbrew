import 'server-only';
import type { Actor } from '@/lib/authz';
import { assertCan, matchesScope } from '@/lib/authz';
import { currentRecordContext, getRecordAuxiliary } from '@/server/data/record-context';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { db } from '@/server/data/store';
import { operatingNowMs } from '@/server/operating-clock';
import { AMENITIES } from '@/domain/bookings';
import { amenitySlotAvailable, RESERVING_BOOKING_STATUSES, type EstateAmenity } from '@/domain/estate/amenities';
import type { Booking } from '@/domain/entities';

export type AmenityRegistry = { amenities: EstateAmenity[]; receipts: { tenantId: string; actorId: string; key: string; hash: string; id: string; name?: string; kind: string }[]; audit: { tenantId: string; actorId: string; action: string; entityId: string; at: string }[] };
export function amenityRegistry(write = false): AmenityRegistry {
  const context = currentRecordContext();
  if (write) {
    if (context && context.mode !== 'write') throw new Error('Amenity changes require a write transaction.');
    return getRecordAuxiliary<AmenityRegistry>('estateAmenities', () => ({ amenities: [], receipts: [], audit: [] }));
  }
  const stored = context?.state.auxiliary.estateAmenities;
  if (stored === undefined) return { amenities: [], receipts: [], audit: [] };
  if (!stored || typeof stored !== 'object' || !Array.isArray((stored as AmenityRegistry).amenities) || !Array.isArray((stored as AmenityRegistry).receipts) || !Array.isArray((stored as AmenityRegistry).audit)) throw new Error('The amenity registry is unavailable.');
  return stored as AmenityRegistry;
}
export function estateAmenitiesFor(actor: Actor, includeArchived = false): EstateAmenity[] {
  const scope = assertCan(actor, 'bookings_amenities', 'read');
  const sharedScope = { ...scope, ownership: null };
  const configured = amenityRegistry().amenities.filter((row) => matchesScope(row, sharedScope) && (includeArchived || row.status === 'active'));
  if (nativeAuthEnabled() || currentRecordContext()?.state.auxiliary.estateAmenities !== undefined) return structuredClone(configured);
  // Historical local fixtures remain illustrations; native companies start empty.
  const sites = db.sites.filter((site) => site.kind === 'estate' && matchesScope({ ...site, siteId: site.id }, sharedScope));
  return sites.flatMap((site) => AMENITIES.map((row, index) => ({ ...row, tenantId: String(site.tenantId), siteId: String(site.id), id: `legacy-amenity-${site.id}-${index}`, openMinute: 8 * 60, closeMinute: 22 * 60, durationMinutes: 120, status: 'active' as const, revision: 1, createdAt: '2026-07-26T00:00:00.000Z', updatedAt: '2026-07-26T00:00:00.000Z' })));
}

/** Recheck configured reservations before a workflow can retain or acquire a slot. */
export function bookingTransitionError(actor: Actor, booking: Booking, _event: string, to: string): string | null {
  if (!booking.amenityId || !(RESERVING_BOOKING_STATUSES as readonly string[]).includes(to)) return null;
  const amenity = estateAmenitiesFor(actor, true).find((row) => row.id === booking.amenityId && row.siteId === booking.estateId);
  if (!amenity || amenity.status !== 'active') return 'This amenity is unavailable. Review its configuration before approving a reservation.';
  if (!booking.endISO || Date.parse(booking.endISO) <= operatingNowMs()) return 'This reserved interval has already ended. Record a new future reservation.';
  if (!amenitySlotAvailable(amenity, booking.slot, booking.endISO, db.bookings, booking.id)) return 'The reserved interval exceeds this amenity’s current capacity.';
  return null;
}

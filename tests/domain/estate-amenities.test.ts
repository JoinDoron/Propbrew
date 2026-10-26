import { describe, expect, it } from 'vitest';
import { amenityMinor, amenityWatParts, amenityApproval, amenityBookingEnd, amenitySlotAvailable, type EstateAmenity } from '@/domain/estate/amenities';
const amenity: EstateAmenity = { id: 'one', tenantId: 'tenant', siteId: 'site', name: 'Court', capacity: 1, feeMinor: 0, autoApprove: 'off_peak', openMinute: 480, closeMinute: 1320, durationMinutes: 120, status: 'active', revision: 1, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };
const booking = (id: string, slot: string, endISO: string, status = 'requested') => ({ id, tenantId: 'tenant', estateId: 'site', amenityId: 'one', amenity: 'Court', status, slot, endISO });
describe('Estate amenity operating rules', () => {
  it('parses exact NGN minor units without rounding or exponent notation', () => {
    expect(amenityMinor('0.29')).toBe(29); expect(amenityMinor('1200.05')).toBe(120005);
    for (const value of ['-1', '0.001', '1e3', 'NaN', 'Infinity', '01.20', '1,000']) expect(() => amenityMinor(value)).toThrow();
  });
  it('uses WAT rather than UTC at the five pm approval boundary', () => {
    expect(amenityWatParts('2026-11-02T16:00:00Z').minute).toBe(1020);
    expect(amenityApproval(amenity, '2026-11-02T15:59:00Z').auto).toBe(true);
    expect(amenityApproval(amenity, '2026-11-02T16:00:00Z').auto).toBe(false);
    expect(amenityApproval(amenity, '2026-11-01T09:00:00Z').auto).toBe(false);
  });
  it('checks the whole interval against future WAT operating hours', () => {
    const now = Date.parse('2026-11-01T00:00:00Z');
    expect(amenityBookingEnd(amenity, '2026-11-02T19:00:00.000Z', now)).toBe('2026-11-02T21:00:00.000Z');
    expect(() => amenityBookingEnd(amenity, '2026-11-02T20:01:00Z', now)).toThrow('opening hours');
    expect(() => amenityBookingEnd(amenity, '2026-10-01T09:00:00Z', now)).toThrow('future');
    expect(() => amenityBookingEnd(amenity, '2026-11-02T09:00:01Z', now)).toThrow('whole minutes');
  });
  it('reserves requested slots and frees declined or cancelled ones', () => {
    const slot = '2026-11-02T09:00:00Z', end = '2026-11-02T11:00:00Z';
    expect(amenitySlotAvailable(amenity, slot, end, [booking('a', slot, end)])).toBe(false);
    for (const status of ['declined', 'cancelled', 'completed']) expect(amenitySlotAvailable(amenity, slot, end, [booking('a', slot, end, status)])).toBe(true);
    expect(amenitySlotAvailable(amenity, slot, end, [booking('a', slot, end)], 'a')).toBe(true);
  });
  it('counts simultaneous reservations rather than all touching reservations', () => {
    const rows = [booking('a', '2026-11-02T09:00:00Z', '2026-11-02T10:00:00Z'), booking('b', '2026-11-02T10:00:00Z', '2026-11-02T11:00:00Z')];
    expect(amenitySlotAvailable({ ...amenity, capacity: 2 }, '2026-11-02T09:00:00Z', '2026-11-02T11:00:00Z', rows)).toBe(true);
    expect(amenitySlotAvailable({ ...amenity, capacity: 1 }, '2026-11-02T11:00:00Z', '2026-11-02T12:00:00Z', rows)).toBe(true);
    expect(amenitySlotAvailable({ ...amenity, capacity: 2 }, '2026-11-02T09:00:00Z', '2026-11-02T11:00:00Z', [...rows, booking('c', '2026-11-02T09:30:00Z', '2026-11-02T10:30:00Z')])).toBe(false);
  });
  it('ignores identical names belonging to another estate or tenant', () => {
    const slot = '2026-11-02T09:00:00Z', end = '2026-11-02T11:00:00Z';
    expect(amenitySlotAvailable(amenity, slot, end, [{ ...booking('a', slot, end), tenantId: 'other' }, { ...booking('b', slot, end), estateId: 'other-site' }])).toBe(true);
  });
});

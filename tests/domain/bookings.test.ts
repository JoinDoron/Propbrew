import { describe, expect, it } from 'vitest';
import { utilisation, conflicts, wouldAutoApprove, usageHeatmap, revenue, amenityOf, type BookingLike } from '@/domain/bookings';

const bookings: BookingLike[] = [
  { id: 'b1', amenity: 'Clubhouse', status: 'confirmed', slot: '2026-07-28T16:00:00Z', feeMinor: 1_500_000 },
  { id: 'b2', amenity: 'Clubhouse', status: 'requested', slot: '2026-07-28T17:00:00Z', feeMinor: 1_500_000 },
  { id: 'b3', amenity: 'Tennis Court', status: 'completed', slot: '2026-07-20T09:00:00Z', feeMinor: null },
];

describe('wouldAutoApprove', () => {
  it('applies the amenity rule (always / off-peak / manual)', () => {
    expect(wouldAutoApprove('Gym', '2026-07-28T20:00:00Z').auto).toBe(true); // always
    expect(wouldAutoApprove('Clubhouse', '2026-07-28T10:00:00Z').auto).toBe(false); // manual
    expect(wouldAutoApprove('Tennis Court', '2026-07-28T10:00:00Z').auto).toBe(true); // Tue 10:00 off-peak
    expect(wouldAutoApprove('Tennis Court', '2026-07-28T19:00:00Z').auto).toBe(false); // evening peak
  });
});

describe('conflicts', () => {
  it('flags two capacity-1 bookings within a window', () => {
    const c = conflicts(bookings);
    expect(c.length).toBe(1);
    expect(c[0].amenity).toBe('Clubhouse');
  });
});

describe('utilisation + revenue', () => {
  it('lists every amenity and sums confirmed/completed fees', () => {
    const u = utilisation(bookings);
    expect(u.length).toBeGreaterThan(0);
    u.forEach((x) => { expect(x.pct).toBeGreaterThanOrEqual(0); expect(x.pct).toBeLessThanOrEqual(100); });
    expect(revenue(bookings)).toBe(1_500_000); // only the confirmed Clubhouse fee
  });
});

describe('usageHeatmap', () => {
  it('is a 7×6 grid of 0–4 intensities, deterministic', () => {
    const g = usageHeatmap('Clubhouse');
    expect(g).toHaveLength(7);
    g.forEach((row) => { expect(row).toHaveLength(6); row.forEach((v) => { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(4); }); });
    expect(usageHeatmap('Clubhouse')).toEqual(g);
    expect(amenityOf('Clubhouse').capacity).toBe(1);
  });
});

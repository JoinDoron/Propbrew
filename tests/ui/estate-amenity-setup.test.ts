import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { BookingsWorkspace } from '@/components/bookings/bookings-workspace';
import { EstateAmenitySetup } from '@/components/bookings/amenity-setup';
import type { EstateAmenity } from '@/domain/estate/amenities';
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/server/actions/transitions', () => ({ transition: vi.fn() }));
vi.mock('@/server/actions/estate-amenity-setup', () => ({ createEstateAmenity: vi.fn(), updateEstateAmenity: vi.fn(), archiveEstateAmenity: vi.fn(), createEstateAmenityBooking: vi.fn() }));
const row: EstateAmenity = { id: 'configured', tenantId: 'company', siteId: 'property', name: 'Palm Court Lounge', capacity: 2, feeMinor: 29, autoApprove: 'manual', openMinute: 480, closeMinute: 1320, durationMinutes: 90, status: 'active', revision: 1, createdAt: '2026-10-26T00:00:00.000Z', updatedAt: '2026-10-26T00:00:00.000Z' };
const sites = [{ id: 'property', name: 'Palm Court' }];
describe('native Estate amenity setup presentation', () => {
  it('shows an honest empty native registry without demo amenities or illustrative demand', () => {
    const html = renderToStaticMarkup(createElement(BookingsWorkspace, { bookings: [], canMutate: true, amenities: [], sites, residents: [], expectedCompanyId: 'company' }));
    expect(html).toContain('No amenities configured'); expect(html).toContain('Add amenity'); expect(html).toContain('No reservable amenities');
    expect(html).not.toContain('Clubhouse'); expect(html).not.toContain('Tennis Court'); expect(html).not.toContain('Weekly demand illustration');
    expect(html).toContain('Active amenities'); expect(html).toContain('Capacity and WAT opening hours are checked');
  });
  it('shows actual configuration and exact fee while keeping booking payment claims explicit', () => {
    const html = renderToStaticMarkup(createElement(EstateAmenitySetup, { amenities: [row], sites, canManage: true, expectedCompanyId: 'company' }));
    expect(html).toContain('Palm Court Lounge'); expect(html).toContain('2 simultaneous bookings'); expect(html).toContain('08:00'); expect(html).toContain('22:00'); expect(html).toContain('90 minutes'); expect(html).toContain('0.29');
    expect(html).toContain('Edit amenity Palm Court Lounge'); expect(html).toContain('Archive amenity Palm Court Lounge');
  });
  it('hides configuration actions from viewers and preserves archived records', () => {
    const html = renderToStaticMarkup(createElement(EstateAmenitySetup, { amenities: [{ ...row, status: 'archived' }], sites, canManage: false, expectedCompanyId: 'company' }));
    expect(html).toContain('Palm Court Lounge'); expect(html).toContain('Archived');
    expect(html).not.toContain('Add amenity'); expect(html).not.toContain('Edit amenity'); expect(html).not.toContain('Archive amenity');
  });
});

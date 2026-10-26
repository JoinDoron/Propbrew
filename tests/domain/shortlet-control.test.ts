import { describe, expect, it } from 'vitest';
import { bookingReadiness, emptyShortletControlState, transactionNetMinor, TURNOVER_CHECKLIST } from '@/domain/shortlet/control';

describe('Shortlet operational controls', () => {
  it('creates isolated control collections and a complete turnover checklist', () => {
    const first = emptyShortletControlState();
    const second = emptyShortletControlState();
    first.approvals.push({ tenantId: 'tenant-a', id: 'approval', kind: 'refund', entityId: 'transaction', title: 'Refund', summary: 'Review', status: 'pending', requestedBy: 'user', requestedAtISO: '2026-10-26T00:00:00Z' });
    expect(second.approvals).toEqual([]);
    expect(TURNOVER_CHECKLIST.map((item) => item.key)).toEqual(['linen', 'bathroom', 'kitchen', 'utilities', 'access']);
  });

  it('counts only approved/completed payments and subtracts refunds', () => {
    const base = { tenantId: 'tenant-a', bookingId: 'booking-a', currency: 'NGN' as const, method: 'bank_transfer' as const, requestedBy: 'user', requestedAtISO: '2026-10-26T00:00:00Z', reference: 'reference' };
    const rows = [
      { ...base, id: 'paid', kind: 'accommodation_payment' as const, amountMinor: 100_000, status: 'completed' as const },
      { ...base, id: 'refund', kind: 'refund' as const, amountMinor: 25_000, status: 'approved' as const },
      { ...base, id: 'pending', kind: 'accommodation_payment' as const, amountMinor: 90_000, status: 'pending_match' as const },
    ];
    expect(transactionNetMinor(rows, 'booking-a')).toBe(75_000);
    expect(transactionNetMinor(rows, 'booking-b')).toBe(0);
  });

  it('blocks unverified guests and unresolved damage handoffs', () => {
    const record = { tenantId: 'tenant-a', id: 'guest', bookingId: 'booking-a', documentType: 'nin' as const, documentLast4: '1234', status: 'verified' as const, consentAtISO: '2026-10-26T00:00:00Z' };
    expect(bookingReadiness(undefined, undefined)).toBe('blocked');
    expect(bookingReadiness(record, undefined)).toBe('ready');
    expect(bookingReadiness(record, { tenantId: 'tenant-a', id: 'turnover', bookingId: 'booking-a', apartmentId: 'apartment', dueAtISO: '2026-10-27T12:00:00+01:00', status: 'blocked', checklist: [], maintenanceIssueIds: ['issue'], createdAtISO: '2026-10-26T00:00:00Z', updatedAtISO: '2026-10-26T00:00:00Z' })).toBe('blocked');
  });
});

import { describe, expect, it } from 'vitest';
import type { Invoice } from '@/domain/entities';
import { residentInvoiceBalances, formatInvoiceMoney } from '@/domain/estate/invoice-balances';
const invoice = (values: Partial<Invoice> = {}) => ({ tenantId: 'a', ownerUserId: 'resident', unitId: 'unit', status: 'issued', amount: { minor: 1250050, currency: 'NGN' }, paid: { minor: 1000000, currency: 'NGN' }, ...values } as Invoice);
const totals = (rows: Invoice[]) => residentInvoiceBalances(rows, 'a', 'resident', 'unit');
describe('resident invoice-derived balances', () => {
  it('retains kobo when an issued resident balance is displayed', () => {
    expect(formatInvoiceMoney({ minor: 1250050, currency: 'NGN' })).toBe('₦12,500.50');
    expect(formatInvoiceMoney({ minor: 1, currency: 'NGN' })).toBe('₦0.01');
  });
  it('includes issued balances and excludes draft proposals, other units and foreign companies', () => {
    expect(totals([invoice(), invoice({ status: 'draft' }), invoice({ tenantId: 'b' as Invoice['tenantId'] }), invoice({ unitId: 'other' as Invoice['unitId'] })])).toEqual({ balances: [{ minor: 250050, currency: 'NGN' }], invalid: 0 });
  });
  it('groups currencies without conversion and keeps fully paid balances at zero', () => {
    expect(totals([invoice(), invoice({ amount: { minor: 100, currency: 'USD' }, paid: { minor: 100, currency: 'USD' }, status: 'paid' })]).balances).toEqual([{ minor: 250050, currency: 'NGN' }, { minor: 0, currency: 'USD' }]);
  });
  it('marks malformed balances for review instead of reporting them as paid', () => {
    expect(totals([invoice({ paid: { minor: 1, currency: 'USD' } }), invoice({ paid: { minor: 99999999, currency: 'NGN' } }), invoice({ status: 'paid' })])).toEqual({ balances: [], invalid: 3 });
  });
  it('rejects aggregate precision overflow', () => {
    const large = invoice({ amount: { minor: Number.MAX_SAFE_INTEGER, currency: 'NGN' }, paid: { minor: 0, currency: 'NGN' } });
    expect(totals([large, invoice()]).invalid).toBe(1);
  });
});

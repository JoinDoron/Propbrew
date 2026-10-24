import { describe, expect, it } from 'vitest';
import { reviewCollectionInvoice } from '@/domain/estate/collection-review';
import { db } from '@/server/data/store';
import type { Invoice } from '@/domain/entities';

const record = () => ({ ...structuredClone(db.collectionCases.find((row) => row.id === 'col-2')!), amountMinor: 15_000_000 });
const invoice = () => structuredClone(db.invoices.find((row) => row.ref === 'INV-2990')!);

describe('Collection case review against the scoped invoice ledger', () => {
  it('preserves a historical paid case while showing zero invoice outstanding and blocking follow-up', () => {
    const historical = db.collectionCases.find((row) => row.invoiceRef === 'INV-3001')!;
    const before = structuredClone(historical);
    expect(reviewCollectionInvoice(historical, db.invoices)).toMatchObject({ state: 'paid', outstandingMinor: 0, canFollowUp: false });
    expect(historical).toEqual(before);
    expect(historical.amountMinor).toBe(8_500_000);
  });

  it('admits follow-up only when a same-tenant, same-estate, issued NGN balance matches the recorded case', () => {
    expect(reviewCollectionInvoice(record(), [invoice()])).toMatchObject({ state: 'matched', outstandingMinor: 15_000_000, canFollowUp: true });
    for (const dimension of ['tenantId', 'estateId'] as const) {
      const foreign = { ...invoice(), [dimension]: 'foreign-record' } as Invoice;
      expect(reviewCollectionInvoice(record(), [foreign])).toMatchObject({ state: 'missing', outstandingMinor: null, canFollowUp: false });
    }
  });

  it('distinguishes draft, missing, currency and amount mismatches without silently rewriting a case', () => {
    expect(reviewCollectionInvoice(record(), []).state).toBe('missing');
    expect(reviewCollectionInvoice(record(), [{ ...invoice(), status: 'draft' }])).toMatchObject({ state: 'draft', canFollowUp: false });
    const otherCurrency = invoice(); otherCurrency.amount = { minor: 100, currency: 'USD' }; otherCurrency.paid = { minor: 0, currency: 'USD' };
    expect(reviewCollectionInvoice(record(), [otherCurrency])).toMatchObject({ state: 'currency_mismatch', outstandingMinor: null, canFollowUp: false });
    const changed = invoice(); changed.paid = { ...changed.paid, minor: changed.paid.minor + 100 };
    const historical = record(); const before = structuredClone(historical);
    expect(reviewCollectionInvoice(historical, [changed])).toMatchObject({ state: 'balance_mismatch', outstandingMinor: 14_999_900, canFollowUp: false });
    expect(historical).toEqual(before);
  });

  it.each([NaN, Infinity, -100, 0.5])('refuses an invalid invoice balance component %s', (minor) => {
    const invalid = invoice(); invalid.paid = { ...invalid.paid, minor };
    expect(reviewCollectionInvoice(record(), [invalid])).toMatchObject({ state: 'invalid_balance', outstandingMinor: null, canFollowUp: false });
  });
});

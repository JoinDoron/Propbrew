import { describe, expect, it } from 'vitest';
import { buildFinanceSnapshot, payableDeductions, type FinanceLedgerRow } from '@/domain/finance/control';

const row = (overrides: Partial<FinanceLedgerRow>): FinanceLedgerRow => ({ id: '1', ref: 'REF-1', module: 'estate', counterparty: 'Counterparty', description: 'Record', dateISO: '2026-10-01', dueDateISO: '2026-11-01', grossMinor: 100_000_00, paidMinor: 0, outstandingMinor: 100_000_00, status: 'issued', kind: 'receivable', source: 'Test', ...overrides });

describe('cross-module finance control', () => {
  it('calculates WHT and net payable in integer kobo', () => {
    expect(payableDeductions(1_000_000_00, 5)).toEqual({ whtMinor: 50_000_00, netPayableMinor: 950_000_00 });
  });

  it('keeps modules visible and produces transparent 90-day scenarios', () => {
    const snapshot = buildFinanceSnapshot({ todayISO: '2026-10-26', receivables: [row({})], payables: [row({ id: '2', module: 'construction', kind: 'payable', grossMinor: 40_000_00, outstandingMinor: 38_000_00, whtMinor: 2_000_00, status: 'approved' })], recordedInflows: { estate: 20_000_00 }, recordedOutflows: { facility: 5_000_00 } });
    expect(snapshot.moduleSummary.map((item) => item.module)).toEqual(['estate', 'facility', 'shortlet', 'construction']);
    expect(snapshot.totals.receivableMinor).toBe(100_000_00);
    expect(snapshot.totals.payableMinor).toBe(38_000_00);
    expect(snapshot.cashBuckets).toHaveLength(3);
    expect(snapshot.forecast.downsideClosingMinor).toBeLessThan(snapshot.forecast.upsideClosingMinor);
  });
});

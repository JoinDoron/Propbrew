import { describe, expect, it } from 'vitest';
import { inventoryKobo, inventoryValuation, facilityInventoryState } from '@/domain/facility/inventory-setup';
import type { Part } from '@/domain/facility';
import type { WorkspaceRecordState } from '@/server/data/record-context';
const part = (stock: number, minor: number, currency = 'NGN') => ({ stock, unitCost: { minor, currency } } as Part);
describe('Facility inventory exact accounting', () => {
  it('parses non-negative NGN costs exactly without exponent syntax or rounding', () => {
    expect(inventoryKobo('0')).toBe(0); expect(inventoryKobo('0.29')).toBe(29); expect(inventoryKobo('2500.05')).toBe(250005);
    for (const value of ['-1', '1.001', '1e3', 'Infinity', 'NaN', '01.20', '1,000', '9007199254740993']) expect(inventoryKobo(value)).toBeNull();
  });
  it('keeps foreign currencies separate and reports invalid or overflowing totals', () => {
    expect(inventoryValuation([part(10, 29), part(2, 500, 'USD')])).toEqual({ ngnMinor: 290, excluded: 1, review: false });
    expect(inventoryValuation([part(2, Number.MAX_SAFE_INTEGER)])).toMatchObject({ review: true });
    expect(inventoryValuation([part(0.5, 10)])).toMatchObject({ review: true });
  });
  it('reads an absent ledger without mutating an existing workspace and rejects foreign sidecars', () => {
    const state: WorkspaceRecordState = { schemaVersion: 1, collections: {}, auxiliary: {}, history: {}, sequences: {} };
    expect(facilityInventoryState(state, 'company').movements).toEqual([]); expect(state.auxiliary).toEqual({});
    facilityInventoryState(state, 'company', true); expect(() => facilityInventoryState(state, 'foreign')).toThrow('another company');
  });
});

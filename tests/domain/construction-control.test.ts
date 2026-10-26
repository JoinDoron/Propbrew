import { describe, expect, it } from 'vitest';
import { claimPayableMinor, emptyConstructionControlState } from '@/domain/construction/control';

describe('Construction operational controls', () => {
  it('calculates exact retention, WHT and payable value in kobo', () => {
    expect(claimPayableMinor(100_000_00, 5, 5)).toEqual({ retentionMinor: 5_000_00, whtMinor: 4_750_00, payableMinor: 90_250_00 });
  });

  it('creates isolated empty control collections', () => {
    const first = emptyConstructionControlState();
    const second = emptyConstructionControlState();
    first.claims.push({} as never);
    expect(second.claims).toHaveLength(0);
  });
});

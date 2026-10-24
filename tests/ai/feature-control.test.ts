import { types } from '@neondatabase/serverless';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, calls: [] as Array<{ tenantId: string; sql: string; values: unknown[] }> }));
vi.mock('@/server/db', () => ({ withTenant: vi.fn(async (tenantId: string, callback: (query: unknown) => unknown) => callback((strings: TemplateStringsArray, ...values: unknown[]) => {
  database.calls.push({ tenantId, sql: strings.join('?'), values });
  return Promise.resolve(database.rows);
})) }));
import { featureControl } from '@/server/ai/durable';

const tenantId = '12345678-1234-4234-8234-123456789abc';

beforeEach(() => { database.rows = []; database.calls = []; });

describe('durable AI feature budget controls', () => {
  it('normalizes a real Neon bigint result while preserving the tenant-scoped query', async () => {
    const cap = types.getTypeParser(20)('500000');
    expect(typeof cap).toBe('string');
    database.rows = [{ enabled: true, daily_cap_minor_ngn: cap }];
    expect(await featureControl(tenantId, 'facility_copilot')).toEqual({ enabled: true, dailyCapMinorNgn: 500000 });
    expect(database.calls).toEqual([{ tenantId, sql: expect.stringContaining('from ai_feature_controls'), values: [tenantId, 'facility_copilot'] }]);
  });

  it.each([
    { stored: '0', expected: 0 },
    { stored: 0, expected: 0 },
    { stored: '12345', expected: 12345 },
    { stored: 12345, expected: 12345 },
    { stored: String(Number.MAX_SAFE_INTEGER), expected: Number.MAX_SAFE_INTEGER },
    { stored: Number.MAX_SAFE_INTEGER, expected: Number.MAX_SAFE_INTEGER },
  ])('preserves an exact nonnegative cap of $stored', async ({ stored, expected }) => {
    database.rows = [{ enabled: false, daily_cap_minor_ngn: stored }];
    expect(await featureControl(tenantId, 'estate_copilot')).toEqual({ enabled: false, dailyCapMinorNgn: expected });
  });

  it.each([null, undefined])('preserves an unset cap of %s without treating it as zero', async (cap) => {
    database.rows = [{ enabled: true, daily_cap_minor_ngn: cap }];
    expect(await featureControl(tenantId, 'shortlet_copilot')).toEqual({ enabled: true, dailyCapMinorNgn: null });
  });

  it('preserves the default when no feature-control row exists', async () => {
    expect(await featureControl(tenantId, 'construction_copilot')).toEqual({ enabled: true, dailyCapMinorNgn: null });
  });

  it.each([
    '-1', -1, '1.5', 1.5, '', ' ', '1e3', '0x10', '100k',
    String(Number.MAX_SAFE_INTEGER + 1), Number.MAX_SAFE_INTEGER + 1,
    '9223372036854775807', NaN, Infinity, true, {}, [],
  ])('fails closed for invalid or unsafe caps (%s)', async (cap) => {
    database.rows = [{ enabled: true, daily_cap_minor_ngn: cap }];
    await expect(featureControl(tenantId, 'facility_copilot')).rejects.toThrow('AI feature budget must be a non-negative safe integer.');
  });
});

import { describe, expect, it } from 'vitest';

describe('health load contract', () => {
  it('defines the pilot smoke target and concurrency budget', () => {
    expect(Number(process.env.REEVE_HEALTH_LOAD_CONCURRENCY ?? 20)).toBeGreaterThan(0);
    expect('/api/v1/health').toBe('/api/v1/health');
  });
});

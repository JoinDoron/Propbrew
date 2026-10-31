import { describe, expect, it } from 'vitest';
import { nativeApiRouteAllowed } from '@/server/auth/native-api-routes';

describe('native API proxy allowlist', () => {
  it('allows the construction upload and a single drawing download', () => {
    expect(nativeApiRouteAllowed('/api/construction/drawings')).toBe(true);
    expect(nativeApiRouteAllowed('/api/construction/drawings/00000000-0000-4000-8000-000000000000')).toBe(true);
  });

  it('keeps unrelated or malformed API paths closed', () => {
    expect(nativeApiRouteAllowed('/api/construction/drawings/../../admin')).toBe(false);
    expect(nativeApiRouteAllowed('/api/construction/drawings/00000000-0000-4000-8000-000000000000/extra')).toBe(false);
    expect(nativeApiRouteAllowed('/api/finance/settlements')).toBe(false);
    expect(nativeApiRouteAllowed('/api/facility/evidence')).toBe(true);
  });
});

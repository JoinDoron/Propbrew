import { describe, expect, it } from 'vitest';
import * as seed from '@/server/data/seed/fixtures';
import { compositeScore, rankVendors, complianceExpiry, recommendForService, slaTrend, allServices } from '@/domain/vendors';
import type { VendorMetrics } from '@/domain/vendors';

const A = (seed.vendors as { tenantId: string }[])[0].tenantId;
const vendors = (seed.vendors as unknown as (VendorMetrics & { tenantId: string })[]).filter((v) => v.tenantId === A);

describe('compositeScore + ranking', () => {
  it('scores in 0–100 and ranking is descending', () => {
    const ranked = rankVendors(vendors);
    ranked.forEach((v) => { const s = compositeScore(v); expect(s).toBeGreaterThanOrEqual(0); expect(s).toBeLessThanOrEqual(100); });
    for (let i = 1; i < ranked.length; i++) expect(compositeScore(ranked[i - 1])).toBeGreaterThanOrEqual(compositeScore(ranked[i]));
  });
  it('an expired-compliance vendor is penalised vs the same profile valid', () => {
    const base = vendors[0];
    const valid = compositeScore({ ...base, compliance: 'valid' });
    const expired = compositeScore({ ...base, compliance: 'expired' });
    expect(expired).toBeLessThan(valid);
  });
});

describe('complianceExpiry', () => {
  it('classifies past vs near vs far', () => {
    const now = Date.parse('2026-07-26');
    expect(complianceExpiry('2026-07-01', now).state).toBe('expired');
    expect(complianceExpiry('2026-08-10', now).state).toBe('soon');
    expect(complianceExpiry('2027-01-01', now).state).toBe('ok');
  });
});

describe('recommendForService', () => {
  it('only returns vendors offering the service, best first', () => {
    const svc = allServices(vendors)[0];
    const recs = recommendForService(vendors, svc);
    recs.forEach((r) => expect(r.vendor.services.some((s) => s.toLowerCase().includes(svc.toLowerCase()))).toBe(true));
    for (let i = 1; i < recs.length; i++) expect(recs[i - 1].score).toBeGreaterThanOrEqual(recs[i].score);
  });
});

describe('slaTrend', () => {
  it('ends at the vendor SLA and stays within 0–100', () => {
    const t = slaTrend(vendors[0]);
    expect(t[t.length - 1]).toBe(vendors[0].slaHitRate);
    t.forEach((p) => { expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThanOrEqual(100); });
  });
});

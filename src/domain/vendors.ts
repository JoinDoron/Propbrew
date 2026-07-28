/**
 * FM-05 — vendor performance & selection (deterministic, no LLM).
 *
 * A composite scorecard (SLA × rating × responsiveness), compliance-expiry
 * urgency, an indicative SLA trend, and a best-vendor recommender for a given
 * service. Spend-to-date is summed from real work-order costs by the caller.
 */

export type VendorMetrics = {
  id: string;
  name: string;
  services: string[];
  compliance: string; // valid | expiring | expired
  insuranceExpiry: string;
  slaHitRate: number; // 0–100
  rating: number; // 0–5
  jobsCompleted: number;
};

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic average response time (hours), proxy for responsiveness. */
export function avgResponseHours(v: Pick<VendorMetrics, 'id'>): number {
  return 2 + (hash(v.id) % 22); // 2–23h
}
export function responsiveness(v: Pick<VendorMetrics, 'id'>): number {
  return Math.max(30, Math.round(100 - avgResponseHours(v) * 3));
}

/** Composite rank 0–100: SLA 45% · rating(→100) 35% · responsiveness 20%,
 *  then a compliance penalty (expired −25, expiring −8). */
export function compositeScore(v: VendorMetrics): number {
  const base = v.slaHitRate * 0.45 + (v.rating / 5) * 100 * 0.35 + responsiveness(v) * 0.2;
  const penalty = v.compliance === 'expired' ? 25 : v.compliance === 'expiring' ? 8 : 0;
  return Math.max(0, Math.round(base - penalty));
}

export function rankVendors(vendors: readonly VendorMetrics[]): VendorMetrics[] {
  return [...vendors].sort((a, b) => compositeScore(b) - compositeScore(a));
}

/* --- compliance expiry ---------------------------------------------------- */

export type Expiry = { days: number; state: 'expired' | 'soon' | 'ok'; label: string };

export function complianceExpiry(insuranceExpiry: string, nowMs: number): Expiry {
  const days = Math.round((Date.parse(insuranceExpiry) - nowMs) / (24 * 3600 * 1000));
  const state = days < 0 ? 'expired' : days <= 30 ? 'soon' : 'ok';
  return { days, state, label: days < 0 ? `expired ${-days}d ago` : days <= 30 ? `expires in ${days}d` : `valid · ${days}d` };
}

/* --- SLA trend ------------------------------------------------------------ */

export function slaTrend(v: VendorMetrics, points = 10): number[] {
  const seed = hash(v.id);
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const wobble = (((seed >> (i % 12)) & 7) - 3.5) * 1.4;
    out.push(Math.max(0, Math.min(100, v.slaHitRate - (1 - t) * 6 + wobble)));
  }
  out[points - 1] = v.slaHitRate;
  return out;
}

/* --- best-vendor recommender (AI-assist, advisory) ------------------------ */

export type Recommendation = { vendor: VendorMetrics; score: number; reason: string };

export function recommendForService(vendors: readonly VendorMetrics[], service: string): Recommendation[] {
  const s = service.toLowerCase();
  return vendors
    .filter((v) => v.services.some((x) => x.toLowerCase().includes(s)))
    .map((v) => {
      const score = compositeScore(v);
      const bits: string[] = [`${v.slaHitRate}% SLA`, `★${v.rating}`, `~${avgResponseHours(v)}h response`];
      if (v.compliance !== 'valid') bits.push(`⚠ ${v.compliance} cover`);
      return { vendor: v, score, reason: bits.join(' · ') };
    })
    .sort((a, b) => b.score - a.score);
}

export function allServices(vendors: readonly VendorMetrics[]): string[] {
  return Array.from(new Set(vendors.flatMap((v) => v.services))).sort();
}

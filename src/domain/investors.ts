/**
 * SC-08 / AI-S-04 — investor sales & ROI projections.
 *
 * Every number here is a DETERMINISTIC estimate computed from the project's own
 * figures against the pinned demo clock (NOW). Nothing is financial advice: the
 * UI must label these "estimate · assumptions shown" and surface the basis. No
 * LLM is involved.
 */

import type { InvestorProject } from './entities';
import { NOW } from './ppm';

/** Assumed months a project has been absorbing sales, by lifecycle stage. This
 *  is the single modelling assumption behind the sales-pace estimate. */
const MONTHS_ON_MARKET: Record<InvestorProject['status'], number> = {
  planning: 2,
  selling: 10,
  construction: 18,
  completed: 26,
};

export type SalesForecast = {
  pctSold: number;
  remaining: number;
  monthsOnMarket: number;
  monthlyPace: number; // units/mo (estimate)
  monthsToSellout: number | null; // null = can't project (no pace); 0 = sold out
  selloutISO: string | null;
  avgUnitMinor: number;
  projectedRevenueMinor: number;
  revenuePct: number;
  roiPct: number;
};

export function addMonthsISO(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

export function forecastProject(p: InvestorProject): SalesForecast {
  const remaining = Math.max(0, p.unitsTotal - p.unitsSold);
  const monthsOnMarket = MONTHS_ON_MARKET[p.status];
  const monthlyPace = p.unitsSold > 0 ? Math.round((p.unitsSold / monthsOnMarket) * 10) / 10 : 0;
  const monthsToSellout = remaining === 0 ? 0 : monthlyPace > 0 ? Math.ceil(remaining / monthlyPace) : null;
  const selloutISO = monthsToSellout && monthsToSellout > 0 ? addMonthsISO(NOW, monthsToSellout) : null;
  const avgUnitMinor = p.unitsSold > 0 ? Math.round(p.salesToDate.minor / p.unitsSold) : 0;
  const projectedRevenueMinor = avgUnitMinor > 0 ? avgUnitMinor * p.unitsTotal : p.salesTarget.minor;
  return {
    pctSold: p.unitsTotal ? Math.round((p.unitsSold / p.unitsTotal) * 100) : 0,
    remaining,
    monthsOnMarket,
    monthlyPace,
    monthsToSellout,
    selloutISO,
    avgUnitMinor,
    projectedRevenueMinor,
    revenuePct: p.salesTarget.minor ? Math.round((p.salesToDate.minor / p.salesTarget.minor) * 100) : 0,
    roiPct: p.projectedRoiPct,
  };
}

export type Funnel = { leads: number; reserved: number; sold: number; leadToSold: number };

/** A deterministic pipeline shape derived from inventory: reserved is a fixed
 *  fraction of unsold stock; leads sit above both. Used for the funnel viz. */
export function pipelineFunnel(p: InvestorProject): Funnel {
  const sold = p.unitsSold;
  const remaining = Math.max(0, p.unitsTotal - sold);
  const reserved = Math.round(remaining * 0.35);
  const leads = Math.round((sold + reserved) * 1.8) + Math.round(remaining * 0.6);
  return { leads, reserved, sold, leadToSold: leads ? Math.round((sold / leads) * 100) : 0 };
}

export type UnitCell = 'sold' | 'reserved' | 'available';

/** Inventory as an ordered grid (sold → reserved → available) for a heatmap. */
export function unitsGrid(p: InvestorProject): UnitCell[] {
  const { reserved } = pipelineFunnel(p);
  return Array.from({ length: p.unitsTotal }, (_, i) =>
    i < p.unitsSold ? 'sold' : i < p.unitsSold + reserved ? 'reserved' : 'available',
  );
}

export type Lead = { name: string; band: string; source: string; score: number; hot: boolean };

const LEAD_NAMES = ['Adebayo O.', 'Chioma N.', 'Ngozi E.', 'Yusuf B.', 'Tunde A.', 'Fatima S.', 'Emeka U.', 'Zainab M.'];
const LEAD_SOURCES = ['Referral', 'Portal enquiry', 'Broker', 'Walk-in', 'Campaign'];
const LEAD_BANDS = ['₦40M+', '₦25–40M', '₦15–25M'];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Deterministic lead list + score for a project (AI-S-04 lead scoring). Score
 *  blends fit (budget band vs avg price) and engagement (source weight). */
export function scoreLeads(p: InvestorProject, n = 5): Lead[] {
  const count = Math.min(n, LEAD_NAMES.length);
  return Array.from({ length: count }, (_, i) => {
    const seed = hash(p.id + i);
    const name = LEAD_NAMES[(hash(p.id) + i) % LEAD_NAMES.length];
    const band = LEAD_BANDS[seed % LEAD_BANDS.length];
    const source = LEAD_SOURCES[(seed >> 3) % LEAD_SOURCES.length];
    const fit = band === '₦40M+' ? 40 : band === '₦25–40M' ? 28 : 18;
    const engagement = source === 'Referral' ? 34 : source === 'Broker' ? 26 : source === 'Portal enquiry' ? 22 : 14;
    const score = Math.min(98, fit + engagement + (seed % 20));
    return { name, band, source, score, hot: score >= 70 };
  }).sort((a, b) => b.score - a.score);
}

export type Portfolio = {
  projects: number;
  unitsTotal: number;
  unitsSold: number;
  salesToDateMinor: number;
  targetMinor: number;
  projectedRevenueMinor: number;
  weightedRoiPct: number;
  pipelineLeads: number;
};

export function portfolioSummary(projects: readonly InvestorProject[]): Portfolio {
  const unitsTotal = projects.reduce((a, p) => a + p.unitsTotal, 0);
  const roiWeight = projects.reduce((a, p) => a + p.projectedRoiPct * p.unitsTotal, 0);
  return {
    projects: projects.length,
    unitsTotal,
    unitsSold: projects.reduce((a, p) => a + p.unitsSold, 0),
    salesToDateMinor: projects.reduce((a, p) => a + p.salesToDate.minor, 0),
    targetMinor: projects.reduce((a, p) => a + p.salesTarget.minor, 0),
    projectedRevenueMinor: projects.reduce((a, p) => a + forecastProject(p).projectedRevenueMinor, 0),
    weightedRoiPct: unitsTotal ? Math.round((roiWeight / unitsTotal) * 10) / 10 : 0,
    pipelineLeads: projects.reduce((a, p) => a + pipelineFunnel(p).leads, 0),
  };
}

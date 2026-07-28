/**
 * SC-08 / AI-S-04 — investor-portal helpers (deterministic, no LLM).
 *
 * Derives a personal HOLDING from a project (units held, invested, projected
 * value), a construction-progress model, an off-plan payment schedule tied to
 * milestones, and a returns projection. Every figure is an estimate on demo
 * assumptions — the UI must label it so; nothing here is financial advice.
 */

import type { InvestorProject } from './entities';

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/* --- personal holding ----------------------------------------------------- */

export type Holding = {
  unitsHeld: number;
  unitPriceMinor: number;
  investedMinor: number;
  ownershipPct: number;
  projectedValueMinor: number;
  gainMinor: number;
  roiPct: number;
};

/** Avg achieved unit price → deterministic 2–4 units held → invested & value. */
export function holdingOf(p: InvestorProject): Holding {
  const unitPriceMinor = p.unitsSold > 0 ? Math.round(p.salesToDate.minor / p.unitsSold) : Math.round(p.salesTarget.minor / p.unitsTotal);
  const unitsHeld = 2 + (hash(p.projectId) % 3);
  const investedMinor = unitsHeld * unitPriceMinor;
  const projectedValueMinor = Math.round(investedMinor * (1 + p.projectedRoiPct / 100));
  return {
    unitsHeld,
    unitPriceMinor,
    investedMinor,
    ownershipPct: p.unitsTotal ? Math.round((unitsHeld / p.unitsTotal) * 1000) / 10 : 0,
    projectedValueMinor,
    gainMinor: projectedValueMinor - investedMinor,
    roiPct: p.projectedRoiPct,
  };
}

/* --- construction progress ------------------------------------------------ */

const PROGRESS_BASE: Record<InvestorProject['status'], number> = { planning: 8, selling: 32, construction: 68, completed: 100 };

export type Milestone = { key: string; label: string; threshold: number; state: 'done' | 'current' | 'upcoming' };

const MILESTONES: { key: string; label: string; threshold: number }[] = [
  { key: 'design', label: 'Design & permits', threshold: 0 },
  { key: 'foundation', label: 'Foundation', threshold: 20 },
  { key: 'superstructure', label: 'Superstructure', threshold: 45 },
  { key: 'finishing', label: 'Finishing', threshold: 75 },
  { key: 'handover', label: 'Handover', threshold: 100 },
];

export function constructionProgress(p: InvestorProject): { pct: number; milestones: Milestone[] } {
  const pct = PROGRESS_BASE[p.status];
  const reachedIdx = MILESTONES.reduce((acc, m, i) => (pct >= m.threshold ? i : acc), 0);
  const milestones = MILESTONES.map((m, i) => ({ ...m, state: (i < reachedIdx ? 'done' : i === reachedIdx ? 'current' : 'upcoming') as Milestone['state'] }));
  return { pct, milestones };
}

/* --- payment schedule ----------------------------------------------------- */

export type Installment = { label: string; pctOfPlan: number; amountMinor: number; dueISO: string; status: 'paid' | 'due' | 'upcoming' };

const PLAN: { label: string; pct: number; at: number }[] = [
  { label: 'Reservation deposit', pct: 20, at: 0 },
  { label: 'Foundation stage', pct: 25, at: 20 },
  { label: 'Superstructure stage', pct: 25, at: 45 },
  { label: 'Finishing stage', pct: 20, at: 75 },
  { label: 'On handover', pct: 10, at: 100 },
];

function isoAddMonths(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`;
}

/** Installments as a % of the investor's plan, tied to build milestones. Paid if
 *  the milestone is complete; the next unpaid one is "due". */
export function paymentSchedule(p: InvestorProject, holding: Holding): Installment[] {
  const { pct } = constructionProgress(p);
  let dueMarked = false;
  return PLAN.map((s, i) => {
    let status: Installment['status'];
    if (pct >= s.at + 1 || (s.at === 0 && pct > 0)) status = 'paid';
    else if (!dueMarked) { status = 'due'; dueMarked = true; }
    else status = 'upcoming';
    return {
      label: s.label,
      pctOfPlan: s.pct,
      amountMinor: Math.round((holding.investedMinor * s.pct) / 100),
      dueISO: isoAddMonths(p.handoverDate.slice(0, 7) + '-01', -(PLAN.length - 1 - i) * 4),
      status,
    };
  });
}

/* --- handover countdown --------------------------------------------------- */

export function handoverCountdown(handoverDate: string, nowMs: number): { days: number; months: number; label: string } {
  const days = Math.round((Date.parse(handoverDate) - nowMs) / (24 * 3600 * 1000));
  const months = Math.round(days / 30);
  return { days, months, label: days <= 0 ? 'handed over' : months >= 2 ? `${months} months` : `${days} days` };
}

/* --- returns projection --------------------------------------------------- */

export type Projection = { capitalGainMinor: number; rentalIncomeMinor: number; totalValueMinor: number; roiPct: number };

/** Compound capital appreciation + simple rental income over a hold period.
 *  All inputs are assumptions surfaced in the UI as such. */
export function projectReturns(investedMinor: number, years: number, appreciationPct: number, yieldPct: number): Projection {
  const capitalGain = Math.round(investedMinor * (Math.pow(1 + appreciationPct / 100, years) - 1));
  const rentalIncome = Math.round(investedMinor * (yieldPct / 100) * years);
  const total = investedMinor + capitalGain + rentalIncome;
  return {
    capitalGainMinor: capitalGain,
    rentalIncomeMinor: rentalIncome,
    totalValueMinor: total,
    roiPct: investedMinor ? Math.round(((capitalGain + rentalIncome) / investedMinor) * 100) : 0,
  };
}

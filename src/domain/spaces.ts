/**
 * FM-04 — space & occupancy analytics (deterministic, no LLM).
 *
 * Occupancy stats, a rent model per unit type (revenue realized vs the vacancy
 * loss), and an indicative vacancy trend. Rents are demo assumptions surfaced as
 * such; nothing here is financial advice.
 */

export type UnitLike = { type: string; occupancy: string };

/** Indicative monthly rent per unit type (₦), for revenue-per-unit modelling. */
export const RENT_BY_TYPE: Record<string, number> = {
  'Studio': 300_000,
  '2-bed apartment': 450_000,
  '3-bed apartment': 650_000,
  'Penthouse': 1_500_000,
  'Office suite': 800_000,
  'Co-working floor': 1_200_000,
  'Retail unit': 500_000,
};
const DEFAULT_RENT = 400_000;

export function rentOf(type: string): number {
  return RENT_BY_TYPE[type] ?? DEFAULT_RENT;
}

export type Occupancy = { total: number; occupied: number; vacant: number; reserved: number; rate: number };

export function occupancyStats(units: readonly UnitLike[]): Occupancy {
  const occupied = units.filter((u) => u.occupancy === 'occupied').length;
  const vacant = units.filter((u) => u.occupancy === 'vacant').length;
  const reserved = units.filter((u) => u.occupancy === 'reserved').length;
  return { total: units.length, occupied, vacant, reserved, rate: units.length ? Math.round((occupied / units.length) * 100) : 0 };
}

export type Revenue = { realized: number; potential: number; vacancyLoss: number; capturePct: number };

/** Realized = rent of occupied units; potential = every non-reserved unit let;
 *  vacancy loss = rent going uncollected on vacant units. */
export function revenueModel(units: readonly UnitLike[]): Revenue {
  const realized = units.filter((u) => u.occupancy === 'occupied').reduce((n, u) => n + rentOf(u.type), 0);
  const potential = units.filter((u) => u.occupancy !== 'reserved').reduce((n, u) => n + rentOf(u.type), 0);
  const vacancyLoss = units.filter((u) => u.occupancy === 'vacant').reduce((n, u) => n + rentOf(u.type), 0);
  return { realized, potential, vacancyLoss, capturePct: potential ? Math.round((realized / potential) * 100) : 0 };
}

/** Indicative occupancy trend ending at the current rate (deterministic). */
export function vacancyTrend(rate: number, points = 10): number[] {
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    const t = i / (points - 1);
    const wobble = (((i * 37) % 11) - 5) / 2; // ±2.5
    out.push(Math.max(0, Math.min(100, rate - (1 - t) * 9 + wobble)));
  }
  out[points - 1] = rate;
  return out;
}

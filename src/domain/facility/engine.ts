/**
 * Facility Intelligence — engine (deterministic, no LLM). Composite site health,
 * generator refuel prediction + fuel-efficiency anomaly detection, inventory
 * stock-out forecasting, SLA + contract-coverage analysis, and permit conflict
 * detection. Advisory outputs are labelled as such in the UI.
 */

import type { Tone } from '@/lib/status-tones';
import type { BuildingSystem, SystemStatus, Alarm, Generator, Part, Contract, Permit, SystemCategory } from './types';

const DAY = 24 * 3600 * 1000;

/* --- control center: composite health ------------------------------------- */

const STATUS_WEIGHT: Record<SystemStatus, number> = { operational: 100, standby: 90, degraded: 55, down: 0 };
export const STATUS_TONE: Record<SystemStatus, Tone> = { operational: 'success', standby: 'info', degraded: 'warn', down: 'danger' };

export function siteHealth(systems: readonly BuildingSystem[]): { score: number; band: Tone; label: string } {
  if (systems.length === 0) return { score: 100, band: 'success', label: 'All clear' };
  const score = Math.round(systems.reduce((n, s) => n + STATUS_WEIGHT[s.status], 0) / systems.length);
  const band: Tone = score >= 90 ? 'success' : score >= 70 ? 'warn' : 'danger';
  return { score, band, label: score >= 90 ? 'Healthy' : score >= 70 ? 'Watch' : 'At risk' };
}

export function alarmCounts(alarms: readonly Alarm[]): { critical: number; warning: number; active: number } {
  const open = alarms.filter((a) => !a.acknowledged);
  return { critical: open.filter((a) => a.severity === 'critical').length, warning: open.filter((a) => a.severity === 'warning').length, active: open.length };
}

/* --- energy: refuel prediction + efficiency anomaly ----------------------- */

export type FuelForecast = { litresRemaining: number; hoursToEmpty: number; runsDryISO: string | null; daysToEmpty: number; band: Tone };

/** Time to dry tank at the current draw and today's runtime pace. */
export function refuelForecast(g: Generator, nowMs: number): FuelForecast {
  const litresRemaining = Math.round((g.fuelPct / 100) * g.tankLitres);
  const hoursPerDay = Math.max(1, g.runtimeHoursToday || 8);
  const litresPerDay = g.litresPerHour * hoursPerDay;
  const daysToEmpty = litresPerDay > 0 ? litresRemaining / litresPerDay : Infinity;
  const hoursToEmpty = g.litresPerHour > 0 ? Math.round(litresRemaining / g.litresPerHour) : 0;
  const runsDryISO = Number.isFinite(daysToEmpty) ? new Date(nowMs + daysToEmpty * DAY).toISOString().slice(0, 10) : null;
  const band: Tone = daysToEmpty <= 1.5 ? 'danger' : daysToEmpty <= 3 ? 'warn' : 'success';
  return { litresRemaining, hoursToEmpty, runsDryISO, daysToEmpty: Math.round(daysToEmpty * 10) / 10, band };
}

/** Percent above/below the generator's efficiency baseline — a fault signal. */
export function fuelAnomaly(g: Generator): { deltaPct: number; anomalous: boolean } {
  const deltaPct = g.baselineLph > 0 ? Math.round(((g.litresPerHour - g.baselineLph) / g.baselineLph) * 100) : 0;
  return { deltaPct, anomalous: deltaPct >= 12 };
}

const DIESEL_PER_LITRE_MINOR = 130000; // ₦1,300/L
const KWH_PER_LITRE = 3.5; // rough genset yield
const CO2_KG_PER_LITRE = 2.68;

export function dieselCost(litres: number): number { return Math.round(litres * DIESEL_PER_LITRE_MINOR); }
export function costPerKwhMinor(): number { return Math.round(DIESEL_PER_LITRE_MINOR / KWH_PER_LITRE); }
export function co2Kg(litres: number): number { return Math.round(litres * CO2_KG_PER_LITRE); }

export function gridReliancePct(generators: readonly Generator[]): { gensetPct: number; gridPct: number } {
  const genHours = generators.reduce((n, g) => n + g.runtimeHoursMonth, 0);
  const totalHours = 24 * 30 * Math.max(1, generators.length);
  const gensetPct = Math.min(100, Math.round((genHours / totalHours) * 100));
  return { gensetPct, gridPct: 100 - gensetPct };
}

/* --- inventory: stock-out prediction -------------------------------------- */

export type StockSignal = { daysToStockout: number | null; band: Tone; belowReorder: boolean };
export function stockSignal(p: Part): StockSignal {
  const perDay = p.usedPerMonth / 30;
  const daysToStockout = perDay > 0 ? Math.round(p.stock / perDay) : null;
  const belowReorder = p.stock <= p.reorderPoint;
  const band: Tone = belowReorder || (daysToStockout !== null && daysToStockout <= 7) ? 'danger' : daysToStockout !== null && daysToStockout <= 21 ? 'warn' : 'success';
  return { daysToStockout, band, belowReorder };
}
export function stockValueMinor(parts: readonly Part[]): number { return parts.reduce((n, p) => n + p.stock * p.unitCost.minor, 0); }

/* --- contracts: renewal + SLA + coverage gap ------------------------------ */

export function contractStatus(c: Pick<Contract, 'endISO'>, nowMs: number): { daysLeft: number; band: Tone; label: string } {
  const daysLeft = Math.round((Date.parse(c.endISO) - nowMs) / DAY);
  const band: Tone = daysLeft < 0 ? 'danger' : daysLeft <= 45 ? 'warn' : 'success';
  return { daysLeft, band, label: daysLeft < 0 ? 'Expired' : daysLeft <= 45 ? 'Expiring' : 'Active' };
}

const ALL_CATEGORIES: (SystemCategory | 'general')[] = ['power', 'vertical_transport', 'water', 'hvac', 'safety', 'access', 'general'];
export const CATEGORY_LABEL: Record<SystemCategory | 'general', string> = {
  power: 'Power / generators', vertical_transport: 'Lifts', water: 'Water systems', hvac: 'HVAC / cooling', safety: 'Fire & safety', access: 'Access control', general: 'General',
};

/** Which system categories have NO active contract — the coverage gap. */
export function coverageGap(contracts: readonly Contract[], nowMs: number): (SystemCategory | 'general')[] {
  const covered = new Set(contracts.filter((c) => Date.parse(c.endISO) >= nowMs).map((c) => c.coversCategory));
  return ALL_CATEGORIES.filter((c) => c !== 'general' && !covered.has(c));
}

/* --- safety: permit conflict detection ------------------------------------ */

export type PermitConflict = { a: Permit; b: Permit };

/** Two active/requested permits overlapping in time AND location — a clash. */
export function permitConflicts(permits: readonly Permit[]): PermitConflict[] {
  const live = permits.filter((p) => p.status !== 'closed');
  const out: PermitConflict[] = [];
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i], b = live[j];
      if (a.location !== b.location) continue;
      const start = Math.max(Date.parse(a.validFromISO), Date.parse(b.validFromISO));
      const end = Math.min(Date.parse(a.validToISO), Date.parse(b.validToISO));
      if (end > start) out.push({ a, b });
    }
  }
  return out;
}

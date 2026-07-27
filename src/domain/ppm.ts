/**
 * PPM domain: the derived/projected types and the config tables the FM-02
 * scheduler and AI-F-01 risk engine compute over. No framework imports.
 *
 * NOW is pinned (matching the rest of the demo) so the risk engine and the
 * occurrence projection are deterministic and unit-testable — never `new Date()`.
 */

import type { AssetId, PpmPlanId, SiteId, BuildingId } from './ids';
import type { Asset, PpmPlan, WorkOrder, PpmBasis, PpmFrequency, ChecklistItem } from './entities';

/** The pinned "today" for every PPM computation. */
export const NOW = '2026-07-26';
export const NOW_MS = Date.parse(NOW);

export type PpmOccurrenceStatus =
  | 'scheduled'
  | 'wo_generated'
  | 'in_progress'
  | 'completed'
  | 'overdue'
  | 'ai_draft';

/** A dated instance of a plan — what the calendar and heatmap render. Mutable
 *  (lives in the store) because generate/complete/reschedule write to it. */
export type PpmOccurrence = {
  tenantId: string;
  id: string;
  planId: PpmPlanId;
  assetId: AssetId;
  assetName: string;
  category: string;
  siteId: SiteId;
  buildingId?: BuildingId;
  frequency: PpmFrequency;
  /** The date the service is due (calendar or runtime-projected, whichever first). */
  dueDate: string;
  /** dueDate − leadTimeDays: when the work order should be generated. */
  generateDate: string;
  basisWon: 'calendar' | 'runtime';
  labourHours: number;
  statutory: boolean;
  statutoryDeadline?: string;
  status: PpmOccurrenceStatus;
  source: 'plan' | 'ai_suggestion';
  workOrderRef?: string;
};

/** Sensor-style runtime feed for engine-hour-driven assets (generators, pumps). */
export type AssetRuntime = {
  tenantId: string;
  assetId: AssetId;
  runtimeHours: number;
  runtimeHoursAtLastService: number;
  runtimeServiceInterval: number;
  dailyRuntimeHours: number;
  lastReadingAt: string;
};

export type RiskBand = 'critical' | 'elevated' | 'healthy';
export type RiskDriver = { key: string; label: string; value: string; contribution: number };

/** Derived (never stored) — the output of scoreAssets(actor). */
export type RiskAssessment = {
  assetId: AssetId;
  assetName: string;
  category: string;
  planId?: PpmPlanId;
  score: number; // 0–100
  band: RiskBand;
  drivers: RiskDriver[];
  topDriver: string;
  confidence: number; // 0–1 (data sufficiency)
  shadow: boolean; // confidence < 0.6
  suggestedDate?: string; // only when a pull-forward is proposed
  suggestReason?: string;
  predictedWindowDays?: number;
};

/* --- config tables (module-level constants, like the tone maps) ----------- */

export type Season = 'rainy' | 'harmattan';
/** Lagos seasons: Rainy Apr–Oct, Harmattan Nov–Feb (Mar treated as rainy shoulder). */
export function seasonOf(iso: string): Season {
  const m = new Date(iso).getUTCMonth() + 1; // 1–12
  return m >= 3 && m <= 10 ? 'rainy' : 'harmattan';
}

export const INTERVAL_DAYS: Record<PpmFrequency, number> = {
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  biannual: 182,
  annual: 365,
};

/** Max days the AI may pull a service forward, by cadence. */
export const MAX_PULL_DAYS: Record<PpmFrequency, number> = {
  weekly: 3,
  monthly: 10,
  quarterly: 21,
  biannual: 30,
  annual: 45,
};

export const EXPECTED_LIFE_YEARS: Record<string, number> = {
  Power: 12,
  Elevators: 20,
  HVAC: 15,
  Plumbing: 10,
  Access: 8,
  Security: 7,
};

/** How much a season stresses each trade (0–1). Absent → 0. */
export const SEASON_SENSITIVITY: Record<string, Partial<Record<Season, number>>> = {
  Power: { rainy: 0.6, harmattan: 0.8 }, // radiators/filters clog in harmattan dust
  Plumbing: { rainy: 0.9, harmattan: 0.2 }, // pumps/drainage under rainy load
  HVAC: { rainy: 0.4, harmattan: 0.7 },
  Access: { rainy: 0.3, harmattan: 0.4 },
  Security: { rainy: 0.4, harmattan: 0.6 }, // CCTV dust
  Elevators: { rainy: 0.3, harmattan: 0.3 },
};

/** Trade → tone for calendar chips and risk pills. */
export const TRADE_TONE: Record<string, 'neutral' | 'info' | 'progress' | 'warn' | 'danger' | 'success' | 'muted'> = {
  Power: 'warn',
  Elevators: 'progress',
  HVAC: 'info',
  Plumbing: 'info',
  Access: 'neutral',
  Security: 'muted',
};

/** The in-house team's weekly labour capacity (hours) — drives overload shading. */
export const WEEKLY_CAPACITY_HOURS = 32;

/* --- date helpers (UTC, deterministic) ------------------------------------ */

const DAY = 86_400_000;
export function addDays(iso: string, n: number): string {
  return new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / DAY);
}
export function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/* --- AI-F-01 risk scoring (pure — the scoped wrapper lives in ppm-risk.ts) - */

const DAY_MS = 86_400_000;
const REACTIVE_ORIGINS = ['resident_request', 'manager', 'failed_inspection'];
const STATUS_PENALTY: Record<string, number> = { operational: 0, under_maintenance: 0.3, degraded: 0.6, out_of_service: 1 };

function yearsSince(iso: string): number {
  return (NOW_MS - Date.parse(iso)) / (365 * DAY_MS);
}
function daysSince(iso: string): number {
  return (NOW_MS - Date.parse(iso)) / DAY_MS;
}

/**
 * The six-signal risk model. PURE — takes already-scoped arrays, returns
 * assessments sorted high→low. The scoped entry point scoreAssets(actor) in
 * src/server/data/ppm-risk.ts feeds this from the actor's repos.
 */
export function computeAllRisk(input: {
  assets: readonly Asset[];
  plans: readonly PpmPlan[];
  workOrders: readonly WorkOrder[];
  runtime: readonly AssetRuntime[];
}): RiskAssessment[] {
  const season = seasonOf(NOW);
  const planByAsset = new Map(input.plans.map((p) => [String(p.assetId), p]));
  const runtimeByAsset = new Map(input.runtime.map((r) => [String(r.assetId), r]));
  const out: RiskAssessment[] = [];

  for (const asset of input.assets) {
    if (asset.archivedAt) continue;
    const plan = planByAsset.get(String(asset.id));
    if (!plan) continue; // no plan → coverage-gap radar's job
    const rt = runtimeByAsset.get(String(asset.id));

    let runtimeStress: number | null = null;
    if (rt && (plan.basis === 'runtime' || plan.basis === 'both')) {
      runtimeStress = clamp01((rt.runtimeHours - rt.runtimeHoursAtLastService) / rt.runtimeServiceInterval);
    }

    const interval = INTERVAL_DAYS[plan.frequency];
    const anchor = plan.lastServicedAt ?? addDays(plan.nextDue, -interval);
    const calendarStress = clamp01(daysSince(anchor) / interval);

    const reactive = input.workOrders.filter(
      (w) => String(w.assetId) === String(asset.id) &&
        REACTIVE_ORIGINS.includes(w.origin) &&
        w.createdAt && Date.parse(w.createdAt) >= NOW_MS - 90 * DAY_MS,
    ).length;
    const failureSignal = clamp01(reactive / 3);

    const statusPenalty = STATUS_PENALTY[asset.status] ?? 0;
    const life = EXPECTED_LIFE_YEARS[asset.category] ?? 12;
    const ageFactor = clamp01(clamp01(yearsSince(asset.purchaseDate) / life) + (Date.parse(asset.warrantyExpiry) < NOW_MS ? 0.15 : 0));
    const seasonalFactor = SEASON_SENSITIVITY[asset.category]?.[season] ?? 0;

    const hasRuntime = runtimeStress !== null;
    const wRuntime = hasRuntime ? 0.28 : 0;
    const wCalendar = hasRuntime ? 0.2 : 0.48;
    const rs = runtimeStress ?? 0;

    const raw = wRuntime * rs + wCalendar * calendarStress + 0.18 * failureSignal + 0.14 * statusPenalty + 0.1 * ageFactor + 0.1 * seasonalFactor;
    const score = Math.round(100 * clamp01(raw));
    const band: RiskBand = score >= 70 ? 'critical' : score >= 45 ? 'elevated' : 'healthy';

    const drivers: RiskDriver[] = ([
      hasRuntime && { key: 'runtime', label: 'Runtime since service', value: `${Math.round(rt!.runtimeHours - rt!.runtimeHoursAtLastService)}h of ${rt!.runtimeServiceInterval}h`, contribution: wRuntime * rs },
      { key: 'calendar', label: 'Calendar overdue', value: `${Math.round(daysSince(anchor))}d since service (${plan.frequency})`, contribution: wCalendar * calendarStress },
      { key: 'failure', label: 'Recent failures', value: `${reactive} reactive job(s) in 90d`, contribution: 0.18 * failureSignal },
      { key: 'status', label: 'Condition', value: asset.status.replace(/_/g, ' '), contribution: 0.14 * statusPenalty },
      { key: 'age', label: 'Age & warranty', value: `${yearsSince(asset.purchaseDate).toFixed(1)}y${Date.parse(asset.warrantyExpiry) < NOW_MS ? ' · out of warranty' : ''}`, contribution: 0.1 * ageFactor },
      { key: 'season', label: `${season} season`, value: seasonalFactor > 0 ? `${asset.category} sensitivity` : 'low', contribution: 0.1 * seasonalFactor },
    ].filter(Boolean) as RiskDriver[]).sort((a, b) => b.contribution - a.contribution);
    const topDriver = drivers[0]?.key ?? 'calendar';

    const signalsPresent =
      (hasRuntime ? 1 : 0) +
      (plan.lastServicedAt && daysSince(plan.lastServicedAt) >= 90 ? 1 : 0) +
      (reactive >= 1 ? 1 : 0) +
      (rt ? 1 : 0);
    const confidence = signalsPresent / 4;

    let suggestedDate: string | undefined;
    let suggestReason: string | undefined;
    let predictedWindowDays: number | undefined;
    if (band !== 'healthy' && (topDriver === 'runtime' || topDriver === 'failure')) {
      let baseDue = plan.nextDue;
      if (rt && plan.runtimeIntervalHours) {
        const remaining = Math.max(0, plan.runtimeIntervalHours - (rt.runtimeHours - rt.runtimeHoursAtLastService));
        const d = rt.dailyRuntimeHours > 0 ? Math.ceil(remaining / rt.dailyRuntimeHours) : 9999;
        const runtimeDue = addDays(NOW, d);
        if (Date.parse(runtimeDue) < Date.parse(baseDue)) baseDue = runtimeDue;
      }
      const pull = Math.round((score / 100) * MAX_PULL_DAYS[plan.frequency]);
      const earliest = addDays(NOW, plan.leadTimeDays);
      const proposed = addDays(baseDue, -pull);
      suggestedDate = Date.parse(proposed) < Date.parse(earliest) ? earliest : proposed;
      predictedWindowDays = Math.max(0, Math.round((Date.parse(baseDue) - NOW_MS) / DAY_MS));
      suggestReason = topDriver === 'runtime'
        ? `${Math.round(rt!.runtimeHours - rt!.runtimeHoursAtLastService)}h since last service — interval is ${rt!.runtimeServiceInterval}h`
        : `${reactive} reactive failures in the last 90 days`;
    }

    out.push({ assetId: asset.id, assetName: asset.name, category: asset.category, planId: plan.id, score, band, drivers, topDriver, confidence, shadow: confidence < 0.6, suggestedDate, suggestReason, predictedWindowDays });
  }

  out.sort((a, b) => b.score - a.score);
  return out;
}

/* --- occurrence projection ------------------------------------------------ */

/**
 * Project a plan into dated occurrences from now to the horizon. The FIRST due
 * date is min(calendar nextDue, runtime-projected date) for runtime/both plans
 * — the "whichever comes first" rule — rolled forward to the current cycle so a
 * long-overdue weekly plan shows one overdue occurrence, not a dozen.
 */
export function projectPlanOccurrences(
  plan: import('./entities').PpmPlan,
  runtime: AssetRuntime | undefined,
  horizonWeeks = 8,
): PpmOccurrence[] {
  const interval = INTERVAL_DAYS[plan.frequency];
  const calendarDue = plan.nextDue;

  let firstDue = calendarDue;
  let basisWon: 'calendar' | 'runtime' = 'calendar';
  if (runtime && (plan.basis === 'runtime' || plan.basis === 'both') && plan.runtimeIntervalHours) {
    const accrued = runtime.runtimeHours - runtime.runtimeHoursAtLastService;
    const remaining = Math.max(0, plan.runtimeIntervalHours - accrued);
    const days = runtime.dailyRuntimeHours > 0 ? Math.ceil(remaining / runtime.dailyRuntimeHours) : 9999;
    const runtimeDue = addDays(NOW, days);
    if (Date.parse(runtimeDue) < Date.parse(calendarDue)) {
      firstDue = runtimeDue;
      basisWon = 'runtime';
    }
  }

  // Roll a deeply-overdue first date forward to the current cycle.
  let start = firstDue;
  while (Date.parse(start) < NOW_MS - interval * 86_400_000) start = addDays(start, interval);

  const horizonEnd = NOW_MS + horizonWeeks * 7 * 86_400_000;
  const out: PpmOccurrence[] = [];
  for (let k = 0; k < 16; k++) {
    const dueDate = k === 0 ? start : addDays(start, k * interval);
    if (Date.parse(dueDate) > horizonEnd) break;
    const overdue = Date.parse(dueDate) < NOW_MS;
    out.push({
      tenantId: plan.tenantId,
      id: `occ-${plan.id}-${k}`,
      planId: plan.id,
      assetId: plan.assetId,
      assetName: plan.assetName,
      category: plan.category,
      siteId: plan.siteId,
      buildingId: plan.buildingId,
      frequency: plan.frequency,
      dueDate,
      generateDate: addDays(dueDate, -plan.leadTimeDays),
      basisWon: k === 0 ? basisWon : 'calendar',
      labourHours: plan.estimatedHours,
      statutory: plan.statutory,
      statutoryDeadline: plan.statutoryDeadline,
      status: overdue ? 'overdue' : 'scheduled',
      source: 'plan',
    });
  }
  return out;
}

export type { ChecklistItem, PpmBasis, PpmFrequency };

import 'server-only';

/**
 * AI-F-01 predictive maintenance — the SCOPED entry point. It reads only the
 * actor's scoped repos (assets, plans, work orders) and joins the runtime feed
 * onto that already-scoped asset set, then delegates to the pure `computeAllRisk`
 * model in @/domain/ppm. So a score can never cross the tenant/estate boundary
 * (§8.2), and the model itself is unit-tested without a server runtime.
 */

import type { Actor } from '@/lib/authz';
import { repos, runtimeForActor } from '@/server/data';
import { operatingClock } from '@/server/operating-clock';
import { currentRecordContext } from '@/server/data/record-context';
import { facilityMaintenanceState } from '@/domain/facility/maintenance';
import { computeAllRisk, type RiskAssessment } from '@/domain/ppm';

function allRows<T>(read: (options: { cursor: string | null; limit: number }) => { items: readonly T[]; cursor: string | null }): T[] {
  const rows: T[] = []; let cursor: string | null = null;
  do { const page = read({ cursor, limit: 500 }); rows.push(...page.items); cursor = page.cursor; } while (cursor !== null);
  return rows;
}

export function scoreAssets(actor: Actor): RiskAssessment[] {
  const context = currentRecordContext(), setup = context && actor.tenantId ? facilityMaintenanceState(context.state, actor.tenantId) : null;
  const plans = allRows((options) => repos.ppmPlans.list(actor, options)).filter((plan) => setup?.plans.find((row) => row.planId === String(plan.id))?.enabled !== false);
  return computeAllRisk({
    now: operatingClock().dateISO,
    planRuntimeBaselines: setup ? Object.fromEntries(setup.plans.map((row) => [row.planId, row.baselineRuntimeHours])) : undefined,
    assets: allRows((options) => repos.assets.list(actor, options)),
    plans,
    workOrders: allRows((options) => repos.workOrders.list(actor, options)),
    runtime: runtimeForActor(actor),
  });
}

/** Assets with NO PPM plan — the coverage-gap radar. */
export function coverageGaps(actor: Actor) {
  const planned = new Set(allRows((options) => repos.ppmPlans.list(actor, options)).map((p) => String(p.assetId)));
  return allRows((options) => repos.assets.list(actor, options)).filter((a) => !a.archivedAt && !planned.has(String(a.id)));
}

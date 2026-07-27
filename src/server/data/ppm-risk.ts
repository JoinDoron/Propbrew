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
import { computeAllRisk, type RiskAssessment } from '@/domain/ppm';

export function scoreAssets(actor: Actor): RiskAssessment[] {
  return computeAllRisk({
    assets: repos.assets.list(actor).items,
    plans: repos.ppmPlans.list(actor).items,
    workOrders: repos.workOrders.list(actor).items,
    runtime: runtimeForActor(actor),
  });
}

/** Assets with NO PPM plan — the coverage-gap radar. */
export function coverageGaps(actor: Actor) {
  const planned = new Set(repos.ppmPlans.list(actor).items.map((p) => String(p.assetId)));
  return repos.assets.list(actor).items.filter((a) => !a.archivedAt && !planned.has(String(a.id)));
}

import 'server-only';
import { currentRecordContext } from '@/server/data/record-context';
import { constructionWorld } from '@/server/reads/construction';
import type { Actor } from '@/lib/authz';
import { evaluateConstructionForecasts, type ForecastSnapshot } from '@/domain/construction/forecast-evaluation';

export function constructionForecastSnapshots(write = false): ForecastSnapshot[] {
  const context = currentRecordContext(); if (!context) return [];
  if (write && context.mode !== 'write') throw new Error('Forecast snapshots require a write transaction.');
  const data = context.state.auxiliary.constructionForecastSnapshots as ForecastSnapshot[] | undefined;
  if (!data) return write ? context.state.auxiliary.constructionForecastSnapshots = [] : [];
  if (!Array.isArray(data)) throw new Error('Forecast snapshot ledger is unavailable.');
  return data;
}

export function constructionForecastEvaluation(actor: Actor) {
  const context = currentRecordContext();
  const world = constructionWorld(actor);
  const visible = new Set(world.projects.map((row) => row.id));
  const snapshots = context?.domainTenantId === actor.tenantId ? constructionForecastSnapshots().filter((row) => row.tenantId === actor.tenantId && visible.has(row.projectId)) : [];
  const outcomes = world.projects.filter((row) => row.status === 'completed').flatMap((project) => {
    const completedAtISO = project.mobilisation?.lifecycle.filter((row) => row.action === 'complete').at(-1)?.atISO;
    const costCodes = world.costCodes.filter((row) => row.projectId === project.id && row.actual.currency === 'NGN');
    const actualCostMinor = costCodes.reduce((sum, row) => sum + row.actual.minor, 0);
    return completedAtISO && costCodes.length && Number.isSafeInteger(actualCostMinor) ? [{ projectId: project.id, completedAtISO, actualCostMinor }] : [];
  });
  return { snapshots, ...evaluateConstructionForecasts(snapshots, outcomes) };
}

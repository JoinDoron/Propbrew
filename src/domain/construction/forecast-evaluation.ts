export type ForecastSnapshot = { id: string; tenantId: string; projectId: string; projectName: string; recordedAtISO: string;
  predictedFinishISO: string; predictedCostMinor: number; baselineFinishISO: string; cpi: number; spi: number; recordedBy: string };
export type ForecastOutcome = { projectId: string; completedAtISO: string; actualCostMinor: number };
export type ForecastEvaluation = { projectId: string; projectName: string; snapshotId: string; forecastAtISO: string;
  predictedFinishISO: string; actualFinishISO: string; finishErrorDays: number; predictedCostMinor: number; actualCostMinor: number; costErrorPct: number };

const day = 86400000;
const dateMs = (value: string) => Date.parse(value.slice(0, 10) + 'T00:00:00Z');
const percentile = (values: number[], fraction: number) => values.sort((a, b) => a - b)[Math.ceil(values.length * fraction) - 1];

/** One pre-completion snapshot per project, at least 14 days before recorded completion.
 * Data-confidence heuristics are never interpreted as calibrated probabilities. */
export function evaluateConstructionForecasts(snapshots: ForecastSnapshot[], outcomes: ForecastOutcome[]) {
  const byProject = new Map<string, ForecastSnapshot[]>();
  for (const snapshot of snapshots) byProject.set(snapshot.projectId, [...byProject.get(snapshot.projectId) ?? [], snapshot]);
  const evaluations: ForecastEvaluation[] = [];
  for (const outcome of outcomes) {
    const observed = dateMs(outcome.completedAtISO);
    if (!Number.isFinite(observed) || !Number.isSafeInteger(outcome.actualCostMinor) || outcome.actualCostMinor <= 0) continue;
    const eligible = (byProject.get(outcome.projectId) ?? []).filter((row) => dateMs(row.recordedAtISO) <= observed - 14 * day)
      .sort((a, b) => b.recordedAtISO.localeCompare(a.recordedAtISO));
    const row = eligible[0]; if (!row) continue;
    const predicted = dateMs(row.predictedFinishISO);
    if (!Number.isFinite(predicted) || !Number.isSafeInteger(row.predictedCostMinor) || row.predictedCostMinor <= 0) continue;
    evaluations.push({ projectId: row.projectId, projectName: row.projectName, snapshotId: row.id, forecastAtISO: row.recordedAtISO,
      predictedFinishISO: row.predictedFinishISO, actualFinishISO: outcome.completedAtISO.slice(0, 10),
      finishErrorDays: Math.round((observed - predicted) / day), predictedCostMinor: row.predictedCostMinor,
      actualCostMinor: outcome.actualCostMinor, costErrorPct: Math.round((outcome.actualCostMinor - row.predictedCostMinor) / outcome.actualCostMinor * 1000) / 10 });
  }
  const count = evaluations.length;
  const mean = (values: number[]) => Math.round(values.reduce((sum, value) => sum + value, 0) / values.length * 10) / 10;
  const calibrated = count >= 5;
  return { evaluations: evaluations.sort((a, b) => b.forecastAtISO.localeCompare(a.forecastAtISO)), count, calibrated,
    meanAbsoluteFinishErrorDays: count ? mean(evaluations.map((row) => Math.abs(row.finishErrorDays))) : null,
    meanFinishBiasDays: count ? mean(evaluations.map((row) => row.finishErrorDays)) : null,
    meanAbsoluteCostErrorPct: count ? mean(evaluations.map((row) => Math.abs(row.costErrorPct))) : null,
    empirical80FinishDays: calibrated ? percentile(evaluations.map((row) => Math.abs(row.finishErrorDays)), .8) : null,
    empirical80CostPct: calibrated ? percentile(evaluations.map((row) => Math.abs(row.costErrorPct)), .8) : null };
}

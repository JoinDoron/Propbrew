/**
 * Copilot model registry, pricing and rate-limit policy — plain data + pure
 * helpers, safe to import from both client and server. The server metering
 * module and the /api/copilot route read pricing/limits from here; the copilot
 * UI reads the model list for its per-tenant model picker.
 */

export type CopilotModelId = 'claude-haiku-4-5-20251001' | 'claude-sonnet-5' | 'claude-opus-5';

export type CopilotModel = {
  id: CopilotModelId; label: string; blurb: string; tier: string;
  /** USD per million tokens — approximate list pricing, for cost estimation. */
  inPerMtokUsd: number; outPerMtokUsd: number;
};

export const COPILOT_MODELS: readonly CopilotModel[] = [
  { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', blurb: 'Fastest, lowest cost', tier: 'Fast', inPerMtokUsd: 1, outPerMtokUsd: 5 },
  { id: 'claude-sonnet-5', label: 'Sonnet 5', blurb: 'Balanced — recommended', tier: 'Balanced', inPerMtokUsd: 3, outPerMtokUsd: 15 },
  { id: 'claude-opus-5', label: 'Opus 5', blurb: 'Most capable, highest cost', tier: 'Max', inPerMtokUsd: 15, outPerMtokUsd: 75 },
];

export const DEFAULT_COPILOT_MODEL: CopilotModelId = 'claude-sonnet-5';

export function copilotModel(id: string): CopilotModel {
  return COPILOT_MODELS.find((m) => m.id === id) ?? COPILOT_MODELS.find((m) => m.id === DEFAULT_COPILOT_MODEL)!;
}

/* --- rate-limit policy (per tenant, sliding window) ------------------------ */
export const COPILOT_RATE_PER_MIN = 15;
export const COPILOT_WINDOW_MS = 60_000;

/** Drop timestamps older than the window. */
export function pruneWindow(times: readonly number[], nowMs: number, windowMs: number = COPILOT_WINDOW_MS): number[] {
  return times.filter((t) => nowMs - t < windowMs);
}
/** True if another request is allowed under the sliding-window limit. */
export function rateAllows(times: readonly number[], nowMs: number, limit: number = COPILOT_RATE_PER_MIN, windowMs: number = COPILOT_WINDOW_MS): boolean {
  return pruneWindow(times, nowMs, windowMs).length < limit;
}

/* --- cost estimation ------------------------------------------------------- */
export const USD_TO_NGN = 1600;

/** Estimated cost in minor Naira (kobo) for a call's token counts on a model. */
export function estCostMinorNgn(inputTokens: number, outputTokens: number, m: CopilotModel): number {
  const usd = (inputTokens / 1e6) * m.inPerMtokUsd + (outputTokens / 1e6) * m.outPerMtokUsd;
  return Math.round(usd * USD_TO_NGN * 100);
}

/** Cheap token estimate (~4 chars/token) for the deterministic fallback path. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

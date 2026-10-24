import 'server-only';

/**
 * Copilot metering + rate limiting. Per-tenant model choice and a running usage
 * meter live in the store; the sliding-window request timestamps are ephemeral
 * module state (timing, not domain data). Cost is estimated from token counts
 * against the selected model's list pricing.
 */

import { db } from '@/server/data/store';
import { withDurableMutation } from '@/server/data/durable-records';
import {
  DEFAULT_COPILOT_MODEL, COPILOT_MODELS, COPILOT_RATE_PER_MIN, COPILOT_WINDOW_MS,
  copilotModel, estCostMinorNgn, pruneWindow, rateAllows, type CopilotModelId,
} from '@/domain/facility';

export type CopilotUsage = { requests: number; inputTokens: number; outputTokens: number; costMinorNgn: number };

/** Per-tenant daily spend guard. Zero/unset means no cap for local development. */
export function dailyCapMinorNgn(): number | null {
  const raw = Number(process.env.REEVE_AI_DAILY_CAP_MINOR_NGN ?? '0');
  return Number.isFinite(raw) && raw > 0 ? Math.round(raw) : null;
}

export function canSpend(tenantId: string): { allowed: boolean; capMinorNgn: number | null; usedMinorNgn: number } {
  const cap = dailyCapMinorNgn();
  const used = getUsage(tenantId).costMinorNgn;
  return { allowed: cap === null || used < cap, capMinorNgn: cap, usedMinorNgn: used };
}

export function getTenantModel(tenantId: string): CopilotModelId {
  const row = db.copilotSettings.find((r) => r.tenantId === tenantId);
  const id = row?.model ?? DEFAULT_COPILOT_MODEL;
  return (COPILOT_MODELS.some((m) => m.id === id) ? id : DEFAULT_COPILOT_MODEL) as CopilotModelId;
}

export function setTenantModel(tenantId: string, model: CopilotModelId): void {
  const row = db.copilotSettings.find((r) => r.tenantId === tenantId);
  if (row) row.model = model;
  else db.copilotSettings.push({ tenantId, model });
}

export function getUsage(tenantId: string): CopilotUsage {
  const row = db.copilotUsage.find((r) => r.tenantId === tenantId);
  return row ? { requests: row.requests, inputTokens: row.inputTokens, outputTokens: row.outputTokens, costMinorNgn: row.costMinorNgn } : { requests: 0, inputTokens: 0, outputTokens: 0, costMinorNgn: 0 };
}

export async function recordUsage(tenantId: string, inputTokens: number, outputTokens: number, modelId: string): Promise<void> {
  return withDurableMutation(async () => {
  const cost = estCostMinorNgn(inputTokens, outputTokens, copilotModel(modelId));
  const row = db.copilotUsage.find((r) => r.tenantId === tenantId);
  if (row) { row.requests += 1; row.inputTokens += inputTokens; row.outputTokens += outputTokens; row.costMinorNgn += cost; }
  else db.copilotUsage.push({ tenantId, requests: 1, inputTokens, outputTokens, costMinorNgn: cost });
  });
}

/* --- sliding-window rate limiter (ephemeral) ------------------------------ */
const windows = new Map<string, number[]>();

export function checkRate(tenantId: string, nowMs: number): { allowed: boolean; remaining: number; retryAfterS: number } {
  const times = pruneWindow(windows.get(tenantId) ?? [], nowMs);
  if (!rateAllows(times, nowMs)) {
    const oldest = Math.min(...times);
    return { allowed: false, remaining: 0, retryAfterS: Math.max(1, Math.ceil((COPILOT_WINDOW_MS - (nowMs - oldest)) / 1000)) };
  }
  times.push(nowMs);
  windows.set(tenantId, times);
  return { allowed: true, remaining: Math.max(0, COPILOT_RATE_PER_MIN - times.length), retryAfterS: 0 };
}

import 'server-only';

import { withTenant } from '@/server/db';

export type ReserveCopilotBudgetInput = {
  tenantId: string; actorId: string; feature: string; model: string; requestId: string;
  reservedCostMinorNgn: number; tenantCapMinorNgn: number | null; featureCapMinorNgn: number | null;
};
export type FinishCopilotBudgetInput = {
  requestId: string; tenantId: string; inputTokens: number; outputTokens: number; costMinorNgn: number;
  status: 'complete' | 'error' | 'stopped'; promptRedacted: string; outputRedacted: string; contextSummary: string;
};
export type CopilotLedgerUsage = { requests: number; inputTokens: number; outputTokens: number; costMinorNgn: number };
type BudgetRow = ReserveCopilotBudgetInput & {
  budgetDay: string; expiresAt: number; status: 'reserved' | 'expired' | FinishCopilotBudgetInput['status'];
  costMinorNgn: number; inputTokens: number; outputTokens: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RESERVATION_TTL_MS = 5 * 60_000;
const demoGlobal = globalThis as typeof globalThis & { __propbrewCopilotLedger?: Map<string, BudgetRow> };
const localRows = process.env.NODE_ENV === 'production' ? new Map<string, BudgetRow>() : (demoGlobal.__propbrewCopilotLedger ??= new Map<string, BudgetRow>());
const nonnegative = (value: number) => Number.isSafeInteger(value) && value >= 0;
const capValid = (value: number | null) => value === null || nonnegative(value);
const textValid = (value: string, max: number) => typeof value === 'string' && value.trim().length > 0 && value.length <= max;
const localKey = (tenantId: string, requestId: string) => JSON.stringify([tenantId, requestId]);
const utcDay = (now: number) => new Date(now).toISOString().slice(0, 10);
const durable = (tenantId: string) => Boolean(process.env.DATABASE_URL) && UUID.test(tenantId);

function expireLocal(tenantId: string, now: number) {
  for (const row of localRows.values()) {
    if (row.tenantId === tenantId && row.status === 'reserved' && row.expiresAt <= now) {
      row.status = 'expired'; row.costMinorNgn = row.reservedCostMinorNgn;
    }
  }
}

/** Reserves one request against its UTC start day. Duplicate IDs never authorise another call. */
export async function reserveCopilotBudget(input: ReserveCopilotBudgetInput): Promise<{ allowed: boolean; reason?: string }> {
  if (!textValid(input.tenantId, 200) || !textValid(input.actorId, 200) || !textValid(input.feature, 80) || !textValid(input.model, 200) || !UUID.test(input.requestId) || !nonnegative(input.reservedCostMinorNgn) || !capValid(input.tenantCapMinorNgn) || !capValid(input.featureCapMinorNgn)) return { allowed: false, reason: 'invalid_reservation' };
  if (durable(input.tenantId)) {
    try {
      const rows = await withTenant(input.tenantId, (query) => query`
        select allowed, reason from reserve_copilot_budget(
          ${input.tenantId}::uuid, ${input.requestId}::uuid, ${input.actorId}, ${input.feature}, ${input.model},
          ${input.reservedCostMinorNgn}::bigint, ${input.tenantCapMinorNgn}::bigint, ${input.featureCapMinorNgn}::bigint
        )
      `) as Array<{ allowed: boolean; reason: string | null }>;
      return rows[0] ? { allowed: rows[0].allowed, ...(rows[0].reason ? { reason: rows[0].reason } : {}) } : { allowed: false, reason: 'ledger_unavailable' };
    } catch { return { allowed: false, reason: 'ledger_unavailable' }; }
  }
  if (process.env.NODE_ENV === 'production') return { allowed: false, reason: 'ledger_unavailable' };
  // Non-UUID/no-database demonstration only. This is not a distributed budget store.
  const now = Date.now(); const day = utcDay(now); expireLocal(input.tenantId, now);
  const key = localKey(input.tenantId, input.requestId);
  if (localRows.has(key)) return { allowed: false, reason: 'request_already_reserved' };
  let tenantUsed = 0; let featureUsed = 0;
  for (const row of localRows.values()) {
    if (row.tenantId !== input.tenantId || row.budgetDay !== day) continue;
    const charge = row.status === 'reserved' ? row.reservedCostMinorNgn : row.costMinorNgn;
    tenantUsed += charge; if (row.feature === input.feature) featureUsed += charge;
  }
  if (input.tenantCapMinorNgn !== null && tenantUsed + input.reservedCostMinorNgn > input.tenantCapMinorNgn) return { allowed: false, reason: 'tenant_daily_budget_exceeded' };
  if (input.featureCapMinorNgn !== null && featureUsed + input.reservedCostMinorNgn > input.featureCapMinorNgn) return { allowed: false, reason: 'feature_daily_budget_exceeded' };
  localRows.set(key, { ...input, budgetDay: day, expiresAt: now + RESERVATION_TTL_MS, status: 'reserved', costMinorNgn: 0, inputTokens: 0, outputTokens: 0 });
  return { allowed: true };
}

/** Final usage reconciles the reservation; unconfirmed stops conservatively consume it. */
export async function finishCopilotBudget(input: FinishCopilotBudgetInput): Promise<{ recorded: boolean }> {
  if (!textValid(input.tenantId, 200) || !UUID.test(input.requestId) || ![input.inputTokens, input.outputTokens, input.costMinorNgn].every(nonnegative) || !['complete', 'error', 'stopped'].includes(input.status) || typeof input.promptRedacted !== 'string' || typeof input.outputRedacted !== 'string' || typeof input.contextSummary !== 'string') return { recorded: false };
  if (durable(input.tenantId)) {
    try {
      const rows = await withTenant(input.tenantId, (query) => query`
        select finish_copilot_budget(
          ${input.tenantId}::uuid, ${input.requestId}::uuid, ${input.inputTokens}::bigint, ${input.outputTokens}::bigint,
          ${input.costMinorNgn}::bigint, ${input.status}, ${input.promptRedacted.slice(0, 6000)},
          ${input.outputRedacted.slice(0, 24000)}, ${input.contextSummary.slice(0, 2000)}
        ) as recorded
      `) as Array<{ recorded: boolean }>;
      return { recorded: rows[0]?.recorded === true };
    } catch { return { recorded: false }; }
  }
  if (process.env.NODE_ENV === 'production') return { recorded: false };
  const row = localRows.get(localKey(input.tenantId, input.requestId));
  if (!row) return { recorded: false };
  if (row.status !== 'reserved' && row.status !== 'expired') return { recorded: true };
  const knownUsage = input.inputTokens > 0 || input.outputTokens > 0 || input.costMinorNgn > 0;
  row.status = input.status;
  row.costMinorNgn = input.status === 'stopped' && !knownUsage ? row.reservedCostMinorNgn : input.costMinorNgn;
  row.inputTokens = input.inputTokens; row.outputTokens = input.outputTokens;
  return { recorded: true };
}

/** Lifetime ledger totals, not the old seeded meter or a provider invoice. */
export async function readCopilotLedgerUsage(tenantId: string): Promise<CopilotLedgerUsage> {
  if (!textValid(tenantId, 200)) throw new Error('Copilot usage ledger unavailable.');
  if (durable(tenantId)) {
    try {
      const rows = await withTenant(tenantId, (query) => query`
        select count(*)::text as requests, coalesce(sum(input_tokens), 0)::text as input_tokens,
          coalesce(sum(output_tokens), 0)::text as output_tokens,
          coalesce(sum(case when status = 'reserved' then reserved_cost_minor_ngn else cost_minor_ngn end), 0)::text as cost_minor_ngn
        from ai_copilot_usage where tenant_id = ${tenantId}::uuid and (
          status in ('complete', 'stopped', 'expired')
          or (status = 'error' and (input_tokens > 0 or output_tokens > 0 or cost_minor_ngn > 0))
          or (status = 'reserved' and expires_at <= now())
        )
      `) as Array<{ requests: string; input_tokens: string; output_tokens: string; cost_minor_ngn: string }>;
      if (!rows[0]) throw new Error('Missing ledger totals');
      const totals = { requests: Number(rows[0].requests), inputTokens: Number(rows[0].input_tokens), outputTokens: Number(rows[0].output_tokens), costMinorNgn: Number(rows[0].cost_minor_ngn) };
      if (!Object.values(totals).every(nonnegative)) throw new Error('Ledger totals exceed supported precision');
      return totals;
    } catch { throw new Error('Copilot usage ledger unavailable.'); }
  }
  if (process.env.NODE_ENV === 'production') throw new Error('Copilot usage ledger unavailable.');
  expireLocal(tenantId, Date.now());
  const totals: CopilotLedgerUsage = { requests: 0, inputTokens: 0, outputTokens: 0, costMinorNgn: 0 };
  for (const row of localRows.values()) {
    if (row.tenantId !== tenantId || row.status === 'reserved' || row.status === 'error' && !row.inputTokens && !row.outputTokens && !row.costMinorNgn) continue;
    totals.requests++; totals.inputTokens += row.inputTokens; totals.outputTokens += row.outputTokens; totals.costMinorNgn += row.costMinorNgn;
  }
  if (!Object.values(totals).every(nonnegative)) throw new Error('Copilot usage ledger unavailable.');
  return totals;
}

import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FinishCopilotBudgetInput, ReserveCopilotBudgetInput } from '@/server/ai/copilot-ledger';

const database = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>>, fail: false, calls: [] as Array<{ tenantId: string; sql: string; values: unknown[] }> }));
vi.mock('@/server/db', () => ({ withTenant: vi.fn(async (tenantId: string, callback: (query: unknown) => unknown) => {
  if (database.fail) throw new Error('Function missing or database unavailable');
  return callback((strings: TemplateStringsArray, ...values: unknown[]) => {
    database.calls.push({ tenantId, sql: strings.join('?'), values });
    return Promise.resolve(database.rows);
  });
}) }));

let ledger: typeof import('@/server/ai/copilot-ledger');
const reservation = (overrides: Partial<ReserveCopilotBudgetInput> = {}): ReserveCopilotBudgetInput => ({ tenantId: 'demo-a', actorId: 'actor-a', feature: 'facility_copilot', model: 'configured-model', requestId: crypto.randomUUID(), reservedCostMinorNgn: 100, tenantCapMinorNgn: 200, featureCapMinorNgn: null, ...overrides });
const finish = (reserved: ReserveCopilotBudgetInput, overrides: Partial<FinishCopilotBudgetInput> = {}): FinishCopilotBudgetInput => ({ tenantId: reserved.tenantId, requestId: reserved.requestId, inputTokens: 10, outputTokens: 20, costMinorNgn: 30, status: 'complete', promptRedacted: '[redacted prompt]', outputRedacted: '[redacted answer]', contextSummary: 'Scoped facts: systems2, alarms1; no raw records', ...overrides });

beforeEach(async () => {
  vi.resetModules(); vi.stubEnv('DATABASE_URL', ''); vi.stubEnv('NODE_ENV', 'test');
  delete (globalThis as typeof globalThis & { __propbrewCopilotLedger?: unknown }).__propbrewCopilotLedger;
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-24T09:00:00Z'));
  database.rows = []; database.fail = false; database.calls = [];
  ledger = await import('@/server/ai/copilot-ledger');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('local demonstration Copilot budget accounting', () => {
  it('reserves concurrent requests atomically before allowing provider execution', async () => {
    const attempts = await Promise.all(Array.from({ length: 20 }, () => ledger.reserveCopilotBudget(reservation({ reservedCostMinorNgn: 60 }))));
    expect(attempts.filter((attempt) => attempt.allowed)).toHaveLength(3);
    expect(attempts.filter((attempt) => !attempt.allowed).every((attempt) => attempt.reason === 'tenant_daily_budget_exceeded')).toBe(true);
  });

  it('keeps feature caps separate while sharing the tenant cap', async () => {
    expect(await ledger.reserveCopilotBudget(reservation({ reservedCostMinorNgn: 60, featureCapMinorNgn: 80 }))).toEqual({ allowed: true });
    expect(await ledger.reserveCopilotBudget(reservation({ reservedCostMinorNgn: 30, featureCapMinorNgn: 80 }))).toMatchObject({ allowed: false, reason: 'feature_daily_budget_exceeded' });
    expect(await ledger.reserveCopilotBudget(reservation({ feature: 'estate_copilot', reservedCostMinorNgn: 60, featureCapMinorNgn: 80 }))).toEqual({ allowed: true });
    expect(await ledger.reserveCopilotBudget(reservation({ feature: 'shortlet_copilot', reservedCostMinorNgn: 81 }))).toMatchObject({ allowed: false, reason: 'tenant_daily_budget_exceeded' });
  });

  it('isolates tenant reservations even when feature and request IDs are identical', async () => {
    const first = reservation({ tenantCapMinorNgn: 100 });
    expect(await ledger.reserveCopilotBudget(first)).toEqual({ allowed: true });
    expect(await ledger.reserveCopilotBudget({ ...first, tenantId: 'demo-b' })).toEqual({ allowed: true });
    expect(await ledger.reserveCopilotBudget(reservation({ tenantCapMinorNgn: 100, reservedCostMinorNgn: 1 }))).toMatchObject({ allowed: false });
  });

  it('denies a duplicate reservation instead of authorising another provider call', async () => {
    const input = reservation();
    expect(await ledger.reserveCopilotBudget(input)).toEqual({ allowed: true });
    expect(await ledger.reserveCopilotBudget(input)).toEqual({ allowed: false, reason: 'request_already_reserved' });
  });

  it('reconciles exact actual minor-unit cost and releases unused reserved budget', async () => {
    const input = reservation({ reservedCostMinorNgn: 150 });
    await ledger.reserveCopilotBudget(input);
    expect(await ledger.finishCopilotBudget(finish(input, { costMinorNgn: 31 }))).toEqual({ recorded: true });
    expect(await ledger.reserveCopilotBudget(reservation({ reservedCostMinorNgn: 169 }))).toEqual({ allowed: true });
    expect(await ledger.reserveCopilotBudget(reservation({ reservedCostMinorNgn: 1 }))).toMatchObject({ allowed: false });
  });

  it('releases a confirmed pre-generation error with zero usage', async () => {
    const input = reservation({ tenantCapMinorNgn: 100 }); await ledger.reserveCopilotBudget(input);
    expect(await ledger.finishCopilotBudget(finish(input, { status: 'error', inputTokens: 0, outputTokens: 0, costMinorNgn: 0 }))).toEqual({ recorded: true });
    expect(await ledger.reserveCopilotBudget(reservation({ tenantCapMinorNgn: 100 }))).toEqual({ allowed: true });
  });

  it('charges confirmed partial usage on errors and preserves unknown stopped usage conservatively', async () => {
    const known = reservation(); await ledger.reserveCopilotBudget(known);
    await ledger.finishCopilotBudget(finish(known, { status: 'error', costMinorNgn: 40 }));
    const unknown = reservation(); await ledger.reserveCopilotBudget(unknown);
    await ledger.finishCopilotBudget(finish(unknown, { status: 'stopped', inputTokens: 0, outputTokens: 0, costMinorNgn: 0 }));
    expect(await ledger.reserveCopilotBudget(reservation({ reservedCostMinorNgn: 61 }))).toMatchObject({ allowed: false });
    expect(await ledger.reserveCopilotBudget(reservation({ reservedCostMinorNgn: 60 }))).toEqual({ allowed: true });
  });

  it('does not silently make expired unknown execution free, and permits later confirmed reconciliation', async () => {
    const input = reservation({ tenantCapMinorNgn: 100 }); await ledger.reserveCopilotBudget(input);
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(await ledger.reserveCopilotBudget(reservation({ tenantCapMinorNgn: 100, reservedCostMinorNgn: 1 }))).toMatchObject({ allowed: false });
    expect(await ledger.finishCopilotBudget(finish(input, { costMinorNgn: 20 }))).toEqual({ recorded: true });
    expect(await ledger.reserveCopilotBudget(reservation({ tenantCapMinorNgn: 100, reservedCostMinorNgn: 80 }))).toEqual({ allowed: true });
  });

  it('uses a UTC day rather than a lifetime counter or local timezone', async () => {
    vi.setSystemTime(new Date('2026-10-24T23:59:00Z'));
    const input = reservation({ tenantCapMinorNgn: 100 }); await ledger.reserveCopilotBudget(input);
    await ledger.finishCopilotBudget(finish(input, { costMinorNgn: 100 }));
    expect(await ledger.reserveCopilotBudget(reservation({ tenantCapMinorNgn: 100 }))).toMatchObject({ allowed: false });
    vi.setSystemTime(new Date('2026-10-25T00:00:00Z'));
    expect(await ledger.reserveCopilotBudget(reservation({ tenantCapMinorNgn: 100 }))).toEqual({ allowed: true });
  });

  it('makes finish idempotent and rejects unknown or cross-tenant request IDs', async () => {
    const input = reservation(); await ledger.reserveCopilotBudget(input);
    expect(await ledger.finishCopilotBudget(finish(input, { tenantId: 'another-tenant' }))).toEqual({ recorded: false });
    expect(await ledger.finishCopilotBudget(finish(input))).toEqual({ recorded: true });
    expect(await ledger.finishCopilotBudget(finish(input, { costMinorNgn: 190 }))).toEqual({ recorded: true });
    expect(await ledger.reserveCopilotBudget(reservation({ reservedCostMinorNgn: 170 }))).toEqual({ allowed: true });
    expect(await ledger.finishCopilotBudget(finish(reservation()))).toEqual({ recorded: false });
  });

  it('records actual cost above a reservation honestly and blocks later budget use', async () => {
    const input = reservation(); await ledger.reserveCopilotBudget(input);
    expect(await ledger.finishCopilotBudget(finish(input, { costMinorNgn: 201 }))).toEqual({ recorded: true });
    expect(await ledger.reserveCopilotBudget(reservation({ reservedCostMinorNgn: 1 }))).toMatchObject({ allowed: false });
  });

  it('rejects invalid money, fractional token counts and explicit zero-cap overspending', async () => {
    expect(await ledger.reserveCopilotBudget(reservation({ reservedCostMinorNgn: -1 }))).toMatchObject({ allowed: false, reason: 'invalid_reservation' });
    expect(await ledger.reserveCopilotBudget(reservation({ tenantCapMinorNgn: 0 }))).toMatchObject({ allowed: false });
    expect(await ledger.reserveCopilotBudget(reservation({ reservedCostMinorNgn: Number.MAX_SAFE_INTEGER + 1 }))).toMatchObject({ allowed: false });
    expect(await ledger.finishCopilotBudget(finish(reservation(), { inputTokens: 1.5 }))).toEqual({ recorded: false });
  });

  it('reads real completed and interrupted totals without seeded values or active reservations', async () => {
    const complete = reservation(); await ledger.reserveCopilotBudget(complete); await ledger.finishCopilotBudget(finish(complete, { costMinorNgn: 31 }));
    const released = reservation(); await ledger.reserveCopilotBudget(released); await ledger.finishCopilotBudget(finish(released, { status: 'error', inputTokens: 0, outputTokens: 0, costMinorNgn: 0 }));
    const active = reservation(); await ledger.reserveCopilotBudget(active);
    const otherTenant = reservation({ tenantId: 'demo-b' }); await ledger.reserveCopilotBudget(otherTenant); await ledger.finishCopilotBudget(finish(otherTenant));
    expect(await ledger.readCopilotLedgerUsage('demo-a')).toEqual({ requests: 1, inputTokens: 10, outputTokens: 20, costMinorNgn: 31 });
    vi.advanceTimersByTime(5 * 60_000 + 1);
    expect(await ledger.readCopilotLedgerUsage('demo-a')).toEqual({ requests: 2, inputTokens: 10, outputTokens: 20, costMinorNgn: 131 });
    expect(await ledger.readCopilotLedgerUsage('demo-b')).toEqual({ requests: 1, inputTokens: 10, outputTokens: 20, costMinorNgn: 30 });
  });

  it('shares the development ledger across separately loaded page and route bundles', async () => {
    const input = reservation(); await ledger.reserveCopilotBudget(input); await ledger.finishCopilotBudget(finish(input));
    vi.resetModules();
    const pageLedger = await import('@/server/ai/copilot-ledger');
    expect(await pageLedger.readCopilotLedgerUsage(input.tenantId)).toEqual({ requests: 1, inputTokens: 10, outputTokens: 20, costMinorNgn: 30 });
    expect(await pageLedger.reserveCopilotBudget(input)).toMatchObject({ allowed: false, reason: 'request_already_reserved' });
  });
});

describe('durable Copilot ledger seam', () => {
  const tenantId = '12345678-1234-4234-8234-123456789abc';

  it('runs reservation through the tenant transaction and passes caps as SQL parameters', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://test.invalid/not-used'); database.rows = [{ allowed: true, reason: null }];
    const input = reservation({ tenantId });
    expect(await ledger.reserveCopilotBudget(input)).toEqual({ allowed: true });
    expect(database.calls).toHaveLength(1); expect(database.calls[0].tenantId).toBe(tenantId);
    expect(database.calls[0].sql).toContain('reserve_copilot_budget');
    expect(database.calls[0].values).toEqual([tenantId, input.requestId, input.actorId, input.feature, input.model, 100, 200, null]);
  });

  it('fails closed when the migration or database is unavailable, without a local fallback', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://test.invalid/not-used'); database.fail = true;
    const input = reservation({ tenantId });
    expect(await ledger.reserveCopilotBudget(input)).toEqual({ allowed: false, reason: 'ledger_unavailable' });
    expect(await ledger.finishCopilotBudget(finish(input))).toEqual({ recorded: false });
    database.fail = false; database.rows = [];
    expect(await ledger.reserveCopilotBudget(input)).toEqual({ allowed: false, reason: 'ledger_unavailable' });
  });

  it('passes bounded, caller-redacted audit strings and confirmed usage to the finishing transaction', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://test.invalid/not-used'); database.rows = [{ recorded: true }];
    const input = reservation({ tenantId });
    expect(await ledger.finishCopilotBudget(finish(input, { promptRedacted: 'p'.repeat(7000), outputRedacted: 'o'.repeat(25000), contextSummary: 's'.repeat(3000) }))).toEqual({ recorded: true });
    expect(database.calls[0].sql).toContain('finish_copilot_budget');
    expect(database.calls[0].values).toEqual([tenantId, input.requestId, 10, 20, 30, 'complete', 'p'.repeat(6000), 'o'.repeat(24000), 's'.repeat(2000)]);
  });

  it('refuses a non-durable production budget instead of advertising memory as persistent', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    const input = reservation();
    expect(await ledger.reserveCopilotBudget(input)).toEqual({ allowed: false, reason: 'ledger_unavailable' });
    expect(await ledger.finishCopilotBudget(finish(input))).toEqual({ recorded: false });
    await expect(ledger.readCopilotLedgerUsage(input.tenantId)).rejects.toThrow('Copilot usage ledger unavailable');
  });

  it('reads tenant ledger totals without prompts or context, and reports unavailable totals honestly', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://test.invalid/not-used');
    database.rows = [{ requests: '2', input_tokens: '1234', output_tokens: '5678', cost_minor_ngn: '12345' }];
    expect(await ledger.readCopilotLedgerUsage(tenantId)).toEqual({ requests: 2, inputTokens: 1234, outputTokens: 5678, costMinorNgn: 12345 });
    expect(database.calls[0].tenantId).toBe(tenantId); expect(database.calls[0].values).toEqual([tenantId]);
    expect(database.calls[0].sql).not.toContain('prompt_redacted'); expect(database.calls[0].sql).not.toContain('grounding_redacted');
    database.fail = true;
    await expect(ledger.readCopilotLedgerUsage(tenantId)).rejects.toThrow('Copilot usage ledger unavailable');
  });

  it('provides tenant-locked UTC accounting, RLS, feature controls and redacted audit in an unapplied migration', () => {
    const sql = readFileSync(new URL('../../db/migrations/006_copilot_usage.sql', import.meta.url), 'utf8');
    const statements = sql.split(/;\s*(?:\n|$)/).map((statement) => statement.trim()).filter(Boolean);
    const functions = statements.filter((statement) => statement.includes('create or replace function'));
    expect(functions).toHaveLength(2);
    for (const statement of functions) {
      expect(statement.match(/\$copilot\$/g)).toHaveLength(2);
      expect(statement).toContain('security invoker');
      expect(statement).toContain('pg_advisory_xact_lock(hashtextextended(p_tenant::text, 714231))');
      expect(statement).toContain("current_setting('app.tenant_id', true)");
    }
    for (const text of ['force row level security', "at time zone 'UTC'", 'budget_day = v_day', 'for share', 'least(p_feature_cap, v_db_cap)', "status = 'expired', cost_minor_ngn = reserved_cost_minor_ngn", 'interval \'5 minutes\'', 'insert into public.ai_interactions', "'provider_unconfirmed'", 'on conflict(id) do nothing']) expect(sql).toContain(text);
    expect(sql).not.toContain('security definer');
  });
});

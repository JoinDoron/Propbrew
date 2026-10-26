import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const boundary = vi.hoisted(() => ({ query: vi.fn(), workspace: vi.fn(), process: vi.fn(), context: vi.fn(), log: vi.fn() }));
vi.mock('@/server/auth/database', () => ({ authDatabasePool: () => ({ query: boundary.query }) }));
vi.mock('@/server/data/record-context', () => ({ currentRecordContext: boundary.context }));
vi.mock('@/server/data/workspace-postgres', () => ({ withWorkspaceState: boundary.workspace }));
vi.mock('@/server/data/store', () => ({ validateWorkspaceRecordState: (value: unknown) => value }));
vi.mock('@/domain/estate/billing-setup', () => ({ processDueEstateCharges: boundary.process }));
vi.mock('@/lib/logger', () => ({ log: boundary.log }));
import { estateRecurringWorkerEnabled, runEstateRecurringSweep, startEstateRecurringWorker, stopEstateRecurringWorker } from '@/server/jobs/estate-recurring';
const company = '74700000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.useFakeTimers(); vi.resetAllMocks();
  for (const [key, value] of Object.entries({ NODE_ENV: 'production', NEXT_PHASE: '', PROPBREW_AUTH_MODE: 'company', PROPBREW_REVIEW_MODE: '0', PROPBREW_WEBSITE_ONLY: '0', DATA_SOURCE: 'postgres', DATABASE_URL: 'postgresql://disposable@localhost/test', PROPBREW_ESTATE_RECURRING_WORKER: '' })) vi.stubEnv(key, value);
  boundary.context.mockReturnValue(undefined); boundary.query.mockResolvedValue({ rows: [] });
});
afterEach(() => { stopEstateRecurringWorker(); vi.useRealTimers(); vi.unstubAllEnvs(); });
describe('bounded recurring draft worker', () => {
  it.each([['NODE_ENV', 'development'], ['NEXT_PHASE', 'phase-production-build'], ['PROPBREW_AUTH_MODE', ''], ['PROPBREW_REVIEW_MODE', '1'], ['PROPBREW_WEBSITE_ONLY', '1'], ['DATA_SOURCE', 'memory'], ['DATABASE_URL', ''], ['PROPBREW_ESTATE_RECURRING_WORKER', '0']])('does not start for %s=%s', async (name, value) => {
    vi.stubEnv(name, value); expect(estateRecurringWorkerEnabled()).toBe(false); startEstateRecurringWorker();
    await vi.advanceTimersByTimeAsync(310_000); expect(boundary.query).not.toHaveBeenCalled();
  });
  it('refuses to run inside a user context', async () => {
    boundary.context.mockReturnValue({ domainTenantId: company }); await expect(runEstateRecurringSweep()).rejects.toThrow('user request'); expect(boundary.query).not.toHaveBeenCalled();
  });
  it('registers once and skips overlapping sweeps without leaking failures', async () => {
    let finish!: (value: { rows: [] }) => void;
    boundary.query.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    startEstateRecurringWorker(); startEstateRecurringWorker(); await vi.advanceTimersByTimeAsync(10_000);
    expect(boundary.query).toHaveBeenCalledTimes(1); await vi.advanceTimersByTimeAsync(300_000); expect(boundary.query).toHaveBeenCalledTimes(1);
    finish({ rows: [] }); await Promise.resolve(); await vi.advanceTimersByTimeAsync(300_000); expect(boundary.query).toHaveBeenCalledTimes(2);
    stopEstateRecurringWorker(); await vi.advanceTimersByTimeAsync(300_000); expect(boundary.query).toHaveBeenCalledTimes(2);
  });
  it('rechecks eligibility and commits cursor recovery even when no new invoice is needed', async () => {
    boundary.query.mockResolvedValueOnce({ rows: [{ tenant_id: company }] });
    const state = { auxiliary: { estateBilling: { cursor: 0 } } }; const sql = vi.fn(async () => ({ rows: [{ allowed: true }] }));
    boundary.process.mockImplementation(() => { state.auxiliary.estateBilling.cursor = 1; return { created: 0, remainingDue: 0, skipped: 0 }; });
    boundary.workspace.mockImplementation(async (_id, _logical, _mode, _init, fn, authorize) => { await authorize({ query: sql }); const result = await fn(state); expect(result.commit).toBe(true); return result.value; });
    expect(await runEstateRecurringSweep()).toEqual({ companies: 1, created: 0, skipped: 0, failed: 0 });
    expect(sql).toHaveBeenCalledExactlyOnceWith('select estate_recurring_company_allowed($1::uuid) allowed', [company]);
    expect(boundary.process.mock.calls[0][3]).toMatchObject({ id: 'system:estate-recurring', role: 'system_timer' });
  });
  it('bounds background catch-up to eight draft batches in one company transaction', async () => {
    boundary.query.mockResolvedValueOnce({ rows: [{ tenant_id: company }] });
    const state = { auxiliary: { estateBilling: { cursor: 0 } } }; const sql = vi.fn(async () => ({ rows: [{ allowed: true }] }));
    boundary.process.mockImplementation(() => { state.auxiliary.estateBilling.cursor++; return { created: 24, remainingDue: 1, skipped: 0 }; });
    boundary.workspace.mockImplementation(async (_id, _logical, _mode, _init, fn, authorize) => { await authorize({ query: sql }); return (await fn(state)).value; });
    expect(await runEstateRecurringSweep()).toMatchObject({ companies: 1, created: 192, failed: 0 });
    expect(boundary.process).toHaveBeenCalledTimes(8); expect(sql).toHaveBeenCalledTimes(2);
  });
  it('continues a bounded directory on the next sweep without starving later companies', async () => {
    const identifiers = Array.from({ length: 2001 }, (_, i) => `74700000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`);
    for (let i = 0; i < 20; i++) boundary.query.mockResolvedValueOnce({ rows: identifiers.slice(i * 100, (i + 1) * 100).map((tenant_id) => ({ tenant_id })) });
    boundary.workspace.mockResolvedValue({ created: 0, remainingDue: 0, skipped: 0 });
    expect((await runEstateRecurringSweep()).companies).toBe(2000);
    boundary.query.mockResolvedValueOnce({ rows: [{ tenant_id: identifiers[2000] }] });
    expect((await runEstateRecurringSweep()).companies).toBe(1);
    expect(boundary.query.mock.calls[20][1]).toEqual([identifiers[1999]]);
    await runEstateRecurringSweep(); expect(boundary.query.mock.calls[21][1]).toEqual([null]);
  });
  it('isolates a failed company and keeps personal details out of logs', async () => {
    boundary.query.mockResolvedValueOnce({ rows: [{ tenant_id: company }] }); boundary.workspace.mockRejectedValue(new Error('private resident/address credentials'));
    expect(await runEstateRecurringSweep()).toEqual({ companies: 0, created: 0, skipped: 0, failed: 1 });
    expect(JSON.stringify(boundary.log.mock.calls)).not.toContain('private resident');
  });
});

import 'server-only';
import type { PoolClient, QueryResult } from 'pg';
import { authDatabasePool } from '@/server/auth/database';
import { currentRecordContext } from '@/server/data/record-context';
import { validateWorkspaceRecordState } from '@/server/data/store';
import { withWorkspaceState } from '@/server/data/workspace-postgres';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { processDueEstateCharges } from '@/domain/estate/billing-setup';
import { log } from '@/lib/logger';

const INTERVAL_MS = 5 * 60_000;
const FIRST_RUN_MS = 10_000;
const WORKER_BATCHES_PER_COMPANY = 8;
type Worker = { timer?: ReturnType<typeof setInterval>; first?: ReturnType<typeof setTimeout>; running: boolean };
const globals = globalThis as typeof globalThis & { __propbrewEstateRecurringWorker?: Worker; __propbrewEstateRecurringAfter?: string | null };

export function estateRecurringWorkerEnabled(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build'
    && nativeAuthEnabled() && process.env.PROPBREW_REVIEW_MODE !== '1' && process.env.PROPBREW_WEBSITE_ONLY !== '1' && process.env.DATA_SOURCE === 'postgres'
    && Boolean(process.env.DATABASE_URL) && process.env.PROPBREW_ESTATE_RECURRING_WORKER !== '0';
}

/** Internal job only: no HTTP route or caller-selected company is accepted.
 * Discovery exposes IDs of opted-in real companies, never operational payloads.
 * Every projection rechecks eligibility under the same lock as user mutations. */
export async function runEstateRecurringSweep(): Promise<{ companies: number; created: number; skipped: number; failed: number }> {
  if (currentRecordContext()) throw new Error('A recurring sweep cannot run inside a user request.');
  const result = { companies: 0, created: 0, skipped: 0, failed: 0 };
  let after: string | null = globals.__propbrewEstateRecurringAfter ?? null;
  let exhausted = false;
  for (let page = 0; page < 20; page++) {
    const batch: QueryResult<{ tenant_id: string }> = await authDatabasePool().query<{ tenant_id: string }>('select tenant_id from estate_recurring_company_ids($1::uuid,100)', [after]);
    if (!batch.rows.length) { exhausted = true; break; }
    for (const row of batch.rows) {
      after = row.tenant_id;
      try {
        let transaction: PoolClient | undefined;
        const projected = await withWorkspaceState(row.tenant_id, row.tenant_id, 'write', () => {
          throw new Error('A scheduled charge cannot initialise a company.');
        }, async (payload) => {
          const state = validateWorkspaceRecordState(payload, row.tenant_id);
          const before = JSON.stringify(state.auxiliary.estateBilling);
          const now = new Date();
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
          const attribution = { id: 'system:estate-recurring', name: 'Recurring charge scheduler', role: 'system_timer', at: now.toISOString() };
          const value = { created: 0, remainingDue: 0, skipped: 0 };
          for (let batchIndex = 0; batchIndex < WORKER_BATCHES_PER_COMPANY; batchIndex++) {
            const projected = processDueEstateCharges(state, row.tenant_id, today, attribution);
            value.created += projected.created; value.remainingDue = projected.remainingDue; value.skipped = projected.skipped;
            if (!projected.created || !projected.remainingDue) break;
          }
          validateWorkspaceRecordState(state, row.tenant_id);
          if (value.created > 0) {
            if (!transaction) throw new Error('The recurring audit transaction is unavailable.');
            await transaction.query('insert into audit_events(tenant_id,actor_subject,action,entity,entity_id,payload) values($1::uuid,$2,$3,$4,$5,$6::jsonb)', [row.tenant_id, 'system:estate-recurring', 'estate.recurring.drafts_generated', 'recurring_charge_batch', now.toISOString(), JSON.stringify({ created: value.created, remainingDue: value.remainingDue, skipped: value.skipped })]);
          }
          return { value, payload: state, commit: before !== JSON.stringify(state.auxiliary.estateBilling) || value.created > 0 };
        }, async (client) => {
          transaction = client;
          const allowed = await client.query<{ allowed: boolean }>('select estate_recurring_company_allowed($1::uuid) allowed', [row.tenant_id]);
          if (allowed.rows[0]?.allowed !== true) throw new Error('This company cannot receive scheduled charges.');
        });
        result.companies++; result.created += projected.created; result.skipped += projected.skipped;
      } catch {
        result.failed++;
        // No resident names, amounts, addresses, provider payloads or secrets.
        log('error', 'estate_recurring_company_failed', { tenantId: row.tenant_id });
      }
    }
    if (batch.rows.length < 100) { exhausted = true; break; }
  }
  // Continue the directory next time rather than starving companies beyond a
  // bounded pass. Financial cycle cursors remain durable in PostgreSQL.
  globals.__propbrewEstateRecurringAfter = exhausted ? null : after;
  return result;
}

export function startEstateRecurringWorker(): void {
  if (!estateRecurringWorkerEnabled() || globals.__propbrewEstateRecurringWorker) return;
  const worker: Worker = { running: false };
  globals.__propbrewEstateRecurringWorker = worker;
  const tick = async () => {
    if (worker.running || !estateRecurringWorkerEnabled()) return;
    worker.running = true;
    try {
      const outcome = await runEstateRecurringSweep();
      if (outcome.created || outcome.skipped || outcome.failed) log(outcome.failed ? 'warn' : 'info', 'estate_recurring_sweep', outcome);
    } catch { log('error', 'estate_recurring_sweep_failed'); }
    finally { worker.running = false; }
  };
  worker.first = setTimeout(() => { void tick(); }, FIRST_RUN_MS);
  worker.timer = setInterval(() => { void tick(); }, INTERVAL_MS);
  worker.first.unref(); worker.timer.unref();
}

/** Test/controlled shutdown only; stopping a process never clears saved cursors. */
export function stopEstateRecurringWorker(): void {
  const worker = globals.__propbrewEstateRecurringWorker;
  if (!worker) { delete globals.__propbrewEstateRecurringAfter; return; }
  clearTimeout(worker.first); clearInterval(worker.timer); delete globals.__propbrewEstateRecurringWorker;
  delete globals.__propbrewEstateRecurringAfter;
}

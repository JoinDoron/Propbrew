import 'server-only';
import type { PoolClient, QueryResult } from 'pg';
import { authDatabasePool } from '@/server/auth/database';
import { currentRecordContext } from '@/server/data/record-context';
import { validateWorkspaceRecordState } from '@/server/data/store';
import { withWorkspaceState } from '@/server/data/workspace-postgres';
import { nativeAuthEnabled } from '@/server/auth/mode';
import { processDueFacilityMaintenance } from '@/domain/facility/maintenance';
import { log } from '@/lib/logger';

const INTERVAL_MS = 5 * 60_000;
const FIRST_RUN_MS = 10_000;
const WORKER_BATCHES_PER_COMPANY = 4;
type Worker = { timer?: ReturnType<typeof setInterval>; first?: ReturnType<typeof setTimeout>; running: boolean };
const globals = globalThis as typeof globalThis & { __propbrewFacilityMaintenanceWorker?: Worker; __propbrewFacilityMaintenanceAfter?: string | null };

export function facilityMaintenanceWorkerEnabled(): boolean {
  return process.env.NODE_ENV === 'production' && process.env.NEXT_PHASE !== 'phase-production-build'
    && nativeAuthEnabled() && process.env.PROPBREW_REVIEW_MODE !== '1' && process.env.PROPBREW_WEBSITE_ONLY !== '1' && process.env.DATA_SOURCE === 'postgres'
    && Boolean(process.env.DATABASE_URL) && process.env.PROPBREW_FACILITY_MAINTENANCE_WORKER !== '0';
}

/** Internal job only: no HTTP route or caller-selected company is accepted.
 * Discovery exposes IDs of companies with opted-in automatic plans only.
 * Every projection rechecks eligibility under the same lock as user mutations. */
export async function runFacilityMaintenanceSweep(): Promise<{ companies: number; created: number; skipped: number; failed: number }> {
  if (currentRecordContext()) throw new Error('A maintenance sweep cannot run inside a user request.');
  const result = { companies: 0, created: 0, skipped: 0, failed: 0 };
  let after: string | null = globals.__propbrewFacilityMaintenanceAfter ?? null;
  let exhausted = false;
  for (let page = 0; page < 20; page++) {
    const batch: QueryResult<{ tenant_id: string }> = await authDatabasePool().query<{ tenant_id: string }>('select tenant_id from facility_maintenance_company_ids($1::uuid,100)', [after]);
    if (!batch.rows.length) { exhausted = true; break; }
    for (const row of batch.rows) {
      after = row.tenant_id;
      try {
        let transaction: PoolClient | undefined;
        const projected = await withWorkspaceState(row.tenant_id, row.tenant_id, 'write', () => {
          throw new Error('A maintenance schedule cannot initialise a company.');
        }, async (payload) => {
          const state = validateWorkspaceRecordState(payload, row.tenant_id);
          const before = JSON.stringify(state);
          const now = new Date();
          const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
          const attribution = { id: 'system:facility-maintenance', name: 'Maintenance scheduler', role: 'system_timer', at: now.toISOString() };
          const value = { created: 0, projected: 0, remainingDue: 0, skipped: 0 };
          for (let batchIndex = 0; batchIndex < WORKER_BATCHES_PER_COMPANY; batchIndex++) {
            const projected = processDueFacilityMaintenance(state, row.tenant_id, today, attribution);
            value.created += projected.created; value.projected += projected.projected; value.remainingDue = projected.remainingDue; value.skipped = projected.skipped;
            if (!projected.created || !projected.remainingDue) break;
          }
          validateWorkspaceRecordState(state, row.tenant_id);
          if (value.created > 0 || value.projected > 0) {
            if (!transaction) throw new Error('The maintenance audit transaction is unavailable.');
            await transaction.query('insert into audit_events(tenant_id,actor_subject,action,entity,entity_id,payload) values($1::uuid,$2,$3,$4,$5,$6::jsonb)', [row.tenant_id, 'system:facility-maintenance', 'facility.maintenance.scheduled', 'maintenance_batch', now.toISOString(), JSON.stringify({ created: value.created, projected: value.projected, remainingDue: value.remainingDue, skipped: value.skipped })]);
          }
          return { value, payload: state, commit: before !== JSON.stringify(state) };
        }, async (client) => {
          transaction = client;
          const allowed = await client.query<{ allowed: boolean }>('select facility_maintenance_company_allowed($1::uuid) allowed', [row.tenant_id]);
          if (allowed.rows[0]?.allowed !== true) throw new Error('This company cannot receive maintenance schedules.');
        });
        result.companies++; result.created += projected.created; result.skipped += projected.skipped;
      } catch {
        result.failed++;
        // No personal names, file URLs, addresses, provider payloads or secrets.
        log('error', 'facility_maintenance_company_failed', { tenantId: row.tenant_id });
      }
    }
    if (batch.rows.length < 100) { exhausted = true; break; }
  }
  // Continue the directory next time rather than starving companies beyond a
  // bounded pass. Maintenance occurrences and work-order links remain durable in PostgreSQL.
  globals.__propbrewFacilityMaintenanceAfter = exhausted ? null : after;
  return result;
}

export function startFacilityMaintenanceWorker(): void {
  if (!facilityMaintenanceWorkerEnabled() || globals.__propbrewFacilityMaintenanceWorker) return;
  const worker: Worker = { running: false };
  globals.__propbrewFacilityMaintenanceWorker = worker;
  const tick = async () => {
    if (worker.running || !facilityMaintenanceWorkerEnabled()) return;
    worker.running = true;
    try {
      const outcome = await runFacilityMaintenanceSweep();
      if (outcome.created || outcome.skipped || outcome.failed) log(outcome.failed ? 'warn' : 'info', 'facility_maintenance_sweep', outcome);
    } catch { log('error', 'facility_maintenance_sweep_failed'); }
    finally { worker.running = false; }
  };
  worker.first = setTimeout(() => { void tick(); }, FIRST_RUN_MS);
  worker.timer = setInterval(() => { void tick(); }, INTERVAL_MS);
  worker.first.unref(); worker.timer.unref();
}

/** Test/controlled shutdown only; stopping a process never clears saved occurrences. */
export function stopFacilityMaintenanceWorker(): void {
  const worker = globals.__propbrewFacilityMaintenanceWorker;
  if (!worker) { delete globals.__propbrewFacilityMaintenanceAfter; return; }
  clearTimeout(worker.first); clearInterval(worker.timer); delete globals.__propbrewFacilityMaintenanceWorker;
  delete globals.__propbrewFacilityMaintenanceAfter;
}

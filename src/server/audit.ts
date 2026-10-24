import 'server-only';
import { withTenant } from '@/server/db';

export async function durableAudit(input: { tenantId: string; actorSubject: string; action: string; entity: string; entityId: string; requestId?: string; payload?: Record<string, unknown> }): Promise<void> {
  if (!process.env.DATABASE_URL || !/^[0-9a-f-]{36}$/i.test(input.tenantId)) return;
  await withTenant(input.tenantId, (query) => query`
    insert into audit_events (tenant_id, actor_subject, action, entity, entity_id, request_id, payload)
    values (${input.tenantId}::uuid, ${input.actorSubject}, ${input.action}, ${input.entity}, ${input.entityId}, ${input.requestId ?? null}, ${JSON.stringify(input.payload ?? {})}::jsonb)
  `);
}

export async function searchAudit(tenantId: string, input: { entity?: string; action?: string; before?: string; limit?: number }): Promise<unknown[]> {
  return withTenant(tenantId, (query) => query`
    select id, actor_subject, action, entity, entity_id, request_id, payload, created_at
    from audit_events
    where tenant_id = ${tenantId}::uuid
      and (${input.entity ?? null}::text is null or entity = ${input.entity ?? null})
      and (${input.action ?? null}::text is null or action = ${input.action ?? null})
      and (${input.before ?? null}::timestamptz is null or created_at < ${input.before ?? null}::timestamptz)
    order by created_at desc limit ${Math.max(1, Math.min(input.limit ?? 100, 1000))}
  `);
}

export async function queueRetentionJob(tenantId: string, requestedBy: string, mode: 'delete' | 'anonymise', before: string): Promise<string> {
  const rows = await withTenant(tenantId, (query) => query`
    insert into audit_retention_jobs (tenant_id, requested_by, mode, before_at) values (${tenantId}::uuid, ${requestedBy}, ${mode}, ${before}::timestamptz) returning id
  `) as Array<{ id: string }>;
  return rows[0].id;
}

/** Execute only queued jobs for a tenant; production should invoke this from a protected cron. */
export async function processRetentionJobs(tenantId: string, limit = 10): Promise<number> {
  const jobs = await withTenant(tenantId, (query) => query`select id, mode, before_at from audit_retention_jobs where tenant_id = ${tenantId}::uuid and status = 'queued' order by created_at asc limit ${Math.max(1, Math.min(limit, 50))}`) as Array<{ id: string; mode: 'delete' | 'anonymise'; before_at: string }>;
  for (const job of jobs) {
    const affected = job.mode === 'delete'
      ? await withTenant(tenantId, (query) => query`delete from audit_events where tenant_id = ${tenantId}::uuid and created_at < ${job.before_at}::timestamptz returning id`)
      : await withTenant(tenantId, (query) => query`update audit_events set actor_subject = '[anonymised]', request_id = null, payload = '{}'::jsonb where tenant_id = ${tenantId}::uuid and created_at < ${job.before_at}::timestamptz returning id`);
    const count = Array.isArray(affected) ? affected.length : 0;
    await withTenant(tenantId, (query) => query`update audit_retention_jobs set status = 'completed', affected_rows = ${count}, completed_at = now() where tenant_id = ${tenantId}::uuid and id = ${job.id}::uuid`);
  }
  return jobs.length;
}

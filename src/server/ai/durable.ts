import 'server-only';
import { withTenant } from '@/server/db';
import type { AiFeature } from './gateway';

/** PostgreSQL bigint values arrive as decimal strings unless the driver is customised. */
function dailyCap(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const cap = typeof value === 'number' ? value : typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(cap) || cap < 0) throw new Error('AI feature budget must be a non-negative safe integer.');
  return cap;
}

export async function featureControl(tenantId: string, feature: AiFeature): Promise<{ enabled: boolean; dailyCapMinorNgn: number | null }> {
  const rows = await withTenant(tenantId, (query) => query`select enabled, daily_cap_minor_ngn from ai_feature_controls where tenant_id = ${tenantId}::uuid and feature = ${feature} limit 1`) as Array<{ enabled: boolean; daily_cap_minor_ngn: unknown }>;
  return rows[0] ? { enabled: rows[0].enabled, dailyCapMinorNgn: dailyCap(rows[0].daily_cap_minor_ngn) } : { enabled: true, dailyCapMinorNgn: null };
}

export async function recordAiOverride(input: { tenantId: string; interactionId?: string; actorId: string; decision: string; reason: string }): Promise<void> {
  await withTenant(input.tenantId, (query) => query`insert into ai_overrides (tenant_id, interaction_id, actor_id, decision, reason) values (${input.tenantId}::uuid, ${input.interactionId ?? null}::uuid, ${input.actorId}, ${input.decision}, ${input.reason})`);
}

export async function upsertEmbedding(input: { tenantId: string; sourceType: string; sourceId: string; embedding: number[]; contentRedacted: string }): Promise<void> {
  await withTenant(input.tenantId, (query) => query`
    insert into ai_embeddings (tenant_id, source_type, source_id, embedding, content_redacted)
    values (${input.tenantId}::uuid, ${input.sourceType}, ${input.sourceId}, ${JSON.stringify(input.embedding)}::jsonb, ${input.contentRedacted})
    on conflict (tenant_id, source_type, source_id) do update set embedding = excluded.embedding, content_redacted = excluded.content_redacted
  `);
}

/** Tenant-isolated lexical retrieval seam; replace scoring with pgvector when enabled. */
export async function retrieveTenantContext(tenantId: string, queryText: string, limit = 5): Promise<Array<{ sourceType: string; sourceId: string; content: string }>> {
  const rows = await withTenant(tenantId, (query) => query`
    select source_type, source_id, content_redacted from ai_embeddings
    where tenant_id = ${tenantId}::uuid and content_redacted ilike ${`%${queryText.slice(0, 80)}%`}
    order by created_at desc limit ${Math.max(1, Math.min(limit, 20))}
  `) as Array<{ source_type: string; source_id: string; content_redacted: string }>;
  return rows.map((row) => ({ sourceType: row.source_type, sourceId: row.source_id, content: row.content_redacted }));
}

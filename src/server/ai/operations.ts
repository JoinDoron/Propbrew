import 'server-only';
import { withTenant } from '@/server/db';

export async function recordEvaluation(input: { tenantId: string; feature: string; datasetVersion: string; score: number; results: unknown }): Promise<string> {
  const rows = await withTenant(input.tenantId, (query) => query`
    insert into ai_evaluations (tenant_id, feature, dataset_version, score, results)
    values (${input.tenantId}::uuid, ${input.feature}, ${input.datasetVersion}, ${input.score}, ${JSON.stringify(input.results)}::jsonb) returning id
  `) as Array<{ id: string }>;
  return rows[0].id;
}

export async function checkProviderHealth(provider: string, endpoint: string): Promise<{ status: 'healthy' | 'degraded'; latencyMs: number; error?: string }> {
  const started = Date.now();
  try {
    const response = await fetch(endpoint, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    const result = { status: response.ok ? 'healthy' as const : 'degraded' as const, latencyMs: Date.now() - started, error: response.ok ? undefined : `HTTP ${response.status}` };
    return result;
  } catch (error) { return { status: 'degraded', latencyMs: Date.now() - started, error: error instanceof Error ? error.message : 'Provider unavailable' }; }
}
